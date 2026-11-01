-- =====================================================================
-- Class-BARS geofencing checks (circle + class-box revision)
--
-- MANUAL TEST. Run in the Supabase SQL Editor as postgres.
--
-- Before running this file:
--   1. Apply migrations/12_geofencing.sql.
--   2. Apply migrations/12_geofencing.sql AGAIN.
--      Both runs must succeed; the migration is re-runnable.
--   3. Apply migrations/30_raise_max_accuracy_200.sql.
--   4. Apply migrations/31_fix_box_geofence_contains.sql.
--   5. Apply migrations/33_face_match_confidence.sql.
--
-- This script creates temporary fixtures, exercises the schema, RPC and
-- decision table, then rolls everything back. It leaves no rows behind.
-- If a check fails the whole script aborts with a FAIL message.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_user_meta_data, is_anonymous
) values
  ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'geo-admin@example.invalid', now(), '{"full_name":"Geo Admin"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'geo-lecturer@example.invalid', now(), '{"full_name":"Geo Lecturer"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'geo-student@example.invalid', now(), '{"full_name":"Geo Student"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
   'geo-student2@example.invalid', now(), '{"full_name":"Geo Student 2"}'::jsonb, false)
on conflict (id) do nothing;

insert into public.profiles (id, full_name, role, student_number) values
  ('00000000-0000-4000-8000-000000000001', 'Geo Admin', 'admin', null),
  ('00000000-0000-4000-8000-000000000002', 'Geo Lecturer', 'lecturer', null),
  ('00000000-0000-4000-8000-000000000003', 'Geo Student', 'student', 'GEO-S1'),
  ('00000000-0000-4000-8000-000000000004', 'Geo Student 2', 'student', 'GEO-S2')
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    student_number = excluded.student_number;

insert into public.courses (id, course_code, course_name)
values (
  '00000000-0000-4000-8000-000000001001',
  'GEO-CHECK-101',
  'Geofencing test course'
)
on conflict (id) do update set course_name = excluded.course_name;

insert into public.enrollments (student_id, course_id, academic_year, semester)
values (
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000001001',
  '2026',
  '1'
)
on conflict (student_id, course_id, academic_year, semester) do nothing;

insert into public.venues (id, name)
values ('00000000-0000-4000-8000-000000002002', 'Geo No Fence')
on conflict (id) do update set name = excluded.name;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create function pg_temp.point_at(
  p_lat      double precision,
  p_lng      double precision,
  p_distance double precision,
  p_azimuth  double precision
) returns double precision[]
language sql
as $$
  select array[
    st_y(g::geometry),
    st_x(g::geometry)
  ]
  from (
    select st_project(
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_distance,
      p_azimuth
    ) as g
  ) projected;
$$;

create function pg_temp.corner(
  p_lat    double precision,
  p_lng    double precision,
  p_north  double precision,
  p_east   double precision
) returns jsonb
language sql
as $$
  select jsonb_build_object(
    'lat', st_y(g::geometry),
    'lng', st_x(g::geometry)
  )
  from (
    select st_project(
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      sqrt(p_north * p_north + p_east * p_east),
      atan2(p_east, p_north)
    ) as g
  ) projected;
$$;

create function pg_temp.box_corners(
  p_lat double precision,
  p_lng double precision,
  p_ns  double precision,
  p_ew  double precision
) returns jsonb
language sql
as $$
  select jsonb_build_array(
    pg_temp.corner(p_lat, p_lng, -p_ns / 2, -p_ew / 2),
    pg_temp.corner(p_lat, p_lng, -p_ns / 2,  p_ew / 2),
    pg_temp.corner(p_lat, p_lng,  p_ns / 2,  p_ew / 2),
    pg_temp.corner(p_lat, p_lng,  p_ns / 2, -p_ew / 2)
  );
$$;

create function pg_temp.reverse_corners(p_corners jsonb) returns jsonb
language sql
as $$
  select jsonb_build_array(
    p_corners -> 3,
    p_corners -> 2,
    p_corners -> 1,
    p_corners -> 0
  );
$$;

create function pg_temp.make_circle_venue(
  p_name   text,
  p_lat    double precision,
  p_lng    double precision,
  p_radius double precision
) returns uuid
language plpgsql
as $$
declare
  v_venue uuid;
  v_fence uuid;
begin
  insert into public.venues (name) values (p_name)
  returning id into v_venue;

  insert into public.geofences (shape, center_lat, center_lng, radius_m)
  values ('circle', p_lat, p_lng, p_radius)
  returning id into v_fence;

  update public.venues set geofence_id = v_fence where id = v_venue;
  return v_venue;
end;
$$;

create function pg_temp.make_box_venue(
  p_name    text,
  p_corners jsonb
) returns uuid
language plpgsql
as $$
declare
  v_venue uuid;
  v_fence uuid;
begin
  insert into public.venues (name) values (p_name)
  returning id into v_venue;

  insert into public.geofences (
    shape,
    c1_lat, c1_lng, c2_lat, c2_lng,
    c3_lat, c3_lng, c4_lat, c4_lng
  ) values (
    'box',
    (p_corners -> 0 ->> 'lat')::double precision,
    (p_corners -> 0 ->> 'lng')::double precision,
    (p_corners -> 1 ->> 'lat')::double precision,
    (p_corners -> 1 ->> 'lng')::double precision,
    (p_corners -> 2 ->> 'lat')::double precision,
    (p_corners -> 2 ->> 'lng')::double precision,
    (p_corners -> 3 ->> 'lat')::double precision,
    (p_corners -> 3 ->> 'lng')::double precision
  )
  returning id into v_fence;

  update public.venues set geofence_id = v_fence where id = v_venue;
  return v_venue;
end;
$$;

create function pg_temp.new_session(
  p_course   uuid,
  p_lecturer uuid,
  p_venue    uuid
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.class_sessions (
    course_id, lecturer_id, venue_id, scheduled_start, scheduled_end, status
  ) values (
    p_course, p_lecturer, p_venue, now(), now() + interval '1 hour', 'ongoing'
  )
  returning id into v_id;
  return v_id;
end;
$$;

create function pg_temp.try_checkin(
  p_session  uuid,
  p_student  uuid,
  p_lat      double precision,
  p_lng      double precision,
  p_accuracy double precision
) returns text
language plpgsql
as $$
declare
  v_record public.attendance_records;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_student, 'role', 'authenticated')::text,
    true
  );

  begin
    v_record := public.check_in_attendance(
      p_session, p_student, null, 'manual', 1.0,
      p_lat, p_lng, p_accuracy
    );
    return 'ok:' || v_record.status || ':' || coalesce(v_record.flag_reason, '');
  exception when others then
    return 'err:' || sqlerrm;
  end;
end;
$$;

create function pg_temp.expect_checkin(
  p_session  uuid,
  p_lat      double precision,
  p_lng      double precision,
  p_accuracy double precision,
  p_expected text,
  p_label    text
) returns void
language plpgsql
as $$
declare
  v_result text;
begin
  v_result := pg_temp.try_checkin(
    p_session,
    '00000000-0000-4000-8000-000000000003',
    p_lat,
    p_lng,
    p_accuracy
  );
  if v_result <> p_expected then
    raise exception 'FAIL: % expected %, got %', p_label, p_expected, v_result;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Schema, function signatures and privileges
-- ---------------------------------------------------------------------
do $$
declare
  v_old         int;
  v_new         int;
  v_new9        int;
  v_bad_columns int;
  v_count       int;
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"service_role"}',
    true
  );

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'venues'
      and column_name in ('latitude', 'longitude', 'geofence_radius_m')
  ) then
    raise exception 'FAIL: old inline venue geofence columns still exist';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'venues'
      and column_name = 'geofence_id'
  ) then
    raise exception 'FAIL: venues.geofence_id is missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'venues'
      and indexname = 'venues_geofence_id_key'
  ) then
    raise exception 'FAIL: venues.geofence_id is not unique';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.venues'::regclass
      and conname = 'venues_geofence_id_fkey'
      and confdeltype = 'n'
  ) then
    raise exception 'FAIL: venues.geofence_id FK is missing or not ON DELETE SET NULL';
  end if;

  if not exists (
    select 1 from pg_class
    where oid = 'public.geofences'::regclass and relrowsecurity
  ) then
    raise exception 'FAIL: RLS is not enabled on geofences';
  end if;

  select count(*) into v_bad_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'attendance_records'
    and column_name in ('latitude', 'longitude', 'raw_latitude', 'raw_longitude');
  if v_bad_columns <> 0 then
    raise exception 'FAIL: attendance_records stores raw coordinates';
  end if;

  select count(*) into v_old
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'check_in_attendance'
    and p.pronargs = 5;
  if v_old <> 0 then
    raise exception 'FAIL: old 5-argument check_in_attendance still exists';
  end if;

  select count(*) into v_new
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'check_in_attendance'
    and p.pronargs = 8;
  if v_new <> 1 then
    raise exception 'FAIL: expected one 8-argument check_in_attendance, found %', v_new;
  end if;

  select count(*) into v_new9
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'check_in_attendance'
    and p.pronargs = 9;
  if v_new9 <> 1 then
    raise exception 'FAIL: expected one 9-argument check_in_attendance, found %', v_new9;
  end if;

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'check_in_attendance'
    and p.pronargs in (8, 9)
    and p.prosecdef;
  if v_count <> 2 then
    raise exception 'FAIL: check_in_attendance overloads must be SECURITY DEFINER';
  end if;

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'set_venue_geofence'
    and p.pronargs = 6
    and not p.prosecdef;
  if v_count <> 1 then
    raise exception 'FAIL: set_venue_geofence must be SECURITY INVOKER';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.check_in_attendance(uuid,uuid,uuid,attendance_method,numeric,double precision,double precision,double precision)',
    'execute'
  ) then
    raise exception 'FAIL: authenticated cannot execute check_in_attendance';
  end if;

  if has_function_privilege(
    'anon',
    'public.check_in_attendance(uuid,uuid,uuid,attendance_method,numeric,double precision,double precision,double precision)',
    'execute'
  ) then
    raise exception 'FAIL: anon can execute check_in_attendance';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.check_in_attendance(uuid,uuid,uuid,attendance_method,numeric,double precision,double precision,double precision,double precision)',
    'execute'
  ) then
    raise exception 'FAIL: authenticated cannot execute 9-argument check_in_attendance';
  end if;

  if has_function_privilege(
    'anon',
    'public.check_in_attendance(uuid,uuid,uuid,attendance_method,numeric,double precision,double precision,double precision,double precision)',
    'execute'
  ) then
    raise exception 'FAIL: anon can execute 9-argument check_in_attendance';
  end if;

  if has_function_privilege(
    'authenticated',
    'public._check_in_attendance(uuid,uuid,uuid,attendance_method,numeric,double precision,double precision,double precision,double precision)',
    'execute'
  ) then
    raise exception 'FAIL: authenticated can execute internal _check_in_attendance';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.set_venue_geofence(uuid,text,double precision,double precision,numeric,jsonb)',
    'execute'
  ) then
    raise exception 'FAIL: authenticated cannot execute set_venue_geofence';
  end if;

  if has_function_privilege(
    'anon',
    'public.set_venue_geofence(uuid,text,double precision,double precision,numeric,jsonb)',
    'execute'
  ) then
    raise exception 'FAIL: anon can execute set_venue_geofence';
  end if;

  if not has_table_privilege('authenticated', 'public.geofences', 'select')
     or not has_table_privilege('authenticated', 'public.geofences', 'insert')
     or not has_table_privilege('authenticated', 'public.geofences', 'update')
     or not has_table_privilege('authenticated', 'public.geofences', 'delete') then
    raise exception 'FAIL: authenticated is missing geofence table grants';
  end if;

  if has_table_privilege('anon', 'public.geofences', 'select')
     or has_table_privilege('anon', 'public.geofences', 'insert')
     or has_table_privilege('anon', 'public.geofences', 'update')
     or has_table_privilege('anon', 'public.geofences', 'delete') then
    raise exception 'FAIL: anon has geofence table grants';
  end if;

  if has_table_privilege('authenticated', 'public.attendance_records', 'insert') then
    raise exception 'FAIL: authenticated still has INSERT on attendance_records';
  end if;

  raise notice 'PASS: schema, function signatures and privileges';
end $$;

-- ---------------------------------------------------------------------
-- 2. Circle radius and box geometry constraints
-- ---------------------------------------------------------------------
do $$
declare
  v_corners jsonb;
  v_constraint text;
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"service_role"}',
    true
  );

  insert into public.geofences (shape, center_lat, center_lng, radius_m)
  values ('circle', -15.7894, 35.038, 2);
  insert into public.geofences (shape, center_lat, center_lng, radius_m)
  values ('circle', -15.7894, 35.038, 50);

  begin
    insert into public.geofences (shape, center_lat, center_lng, radius_m)
    values ('circle', -15.7894, 35.038, 1);
    raise exception 'FAIL: radius 1 was accepted';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'geofences_shape_fields_check' then
      raise exception 'FAIL: wrong constraint for radius 1: %', v_constraint;
    end if;
  end;

  begin
    insert into public.geofences (shape, center_lat, center_lng, radius_m)
    values ('circle', -15.7894, 35.038, 51);
    raise exception 'FAIL: radius 51 was accepted';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'geofences_shape_fields_check' then
      raise exception 'FAIL: wrong constraint for radius 51: %', v_constraint;
    end if;
  end;

  begin
    insert into public.geofences (shape, center_lat, center_lng, radius_m)
    values ('circle', 91, 35.038, 10);
    raise exception 'FAIL: circle latitude 91 was accepted';
  exception when check_violation then
    null;
  end;

  -- Valid 6 m x 6 m box (area ~36 m2, corners ~4.24 m from centre).
  v_corners := pg_temp.box_corners(-15.7894, 35.038, 6, 6);
  insert into public.geofences (
    shape, c1_lat, c1_lng, c2_lat, c2_lng,
    c3_lat, c3_lng, c4_lat, c4_lng
  ) values (
    'box',
    (v_corners -> 0 ->> 'lat')::double precision,
    (v_corners -> 0 ->> 'lng')::double precision,
    (v_corners -> 1 ->> 'lat')::double precision,
    (v_corners -> 1 ->> 'lng')::double precision,
    (v_corners -> 2 ->> 'lat')::double precision,
    (v_corners -> 2 ->> 'lng')::double precision,
    (v_corners -> 3 ->> 'lat')::double precision,
    (v_corners -> 3 ->> 'lng')::double precision
  );

  -- Crossed ring: NW, SE, NE, SW.
  begin
    insert into public.geofences (
      shape, c1_lat, c1_lng, c2_lat, c2_lng,
      c3_lat, c3_lng, c4_lat, c4_lng
    ) values (
      'box',
      (v_corners -> 3 ->> 'lat')::double precision,
      (v_corners -> 3 ->> 'lng')::double precision,
      (v_corners -> 1 ->> 'lat')::double precision,
      (v_corners -> 1 ->> 'lng')::double precision,
      (v_corners -> 2 ->> 'lat')::double precision,
      (v_corners -> 2 ->> 'lng')::double precision,
      (v_corners -> 0 ->> 'lat')::double precision,
      (v_corners -> 0 ->> 'lng')::double precision
    );
    raise exception 'FAIL: crossed box was accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if position('crossed' in lower(sqlerrm)) = 0 then
      raise exception 'FAIL: crossed box gave unexpected error: %', sqlerrm;
    end if;
  end;

  -- Collinear corners.
  begin
    insert into public.geofences (
      shape, c1_lat, c1_lng, c2_lat, c2_lng,
      c3_lat, c3_lng, c4_lat, c4_lng
    ) values (
      'box',
      -15.7894, 35.0379,
      -15.7894, 35.03795,
      -15.7894, 35.038,
      -15.7894, 35.03805
    );
    raise exception 'FAIL: collinear box was accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if position('collinear' in lower(sqlerrm)) = 0 then
      raise exception 'FAIL: collinear box gave unexpected error: %', sqlerrm;
    end if;
  end;

  -- Too small: 1 m x 1 m.
  v_corners := pg_temp.box_corners(-15.7894, 35.038, 1, 1);
  begin
    insert into public.geofences (
      shape, c1_lat, c1_lng, c2_lat, c2_lng,
      c3_lat, c3_lng, c4_lat, c4_lng
    ) values (
      'box',
      (v_corners -> 0 ->> 'lat')::double precision,
      (v_corners -> 0 ->> 'lng')::double precision,
      (v_corners -> 1 ->> 'lat')::double precision,
      (v_corners -> 1 ->> 'lng')::double precision,
      (v_corners -> 2 ->> 'lat')::double precision,
      (v_corners -> 2 ->> 'lng')::double precision,
      (v_corners -> 3 ->> 'lat')::double precision,
      (v_corners -> 3 ->> 'lng')::double precision
    );
    raise exception 'FAIL: tiny box was accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if position('at least 4 square metres' in sqlerrm) = 0 then
      raise exception 'FAIL: tiny box gave unexpected error: %', sqlerrm;
    end if;
  end;

  -- Oversized: 120 m x 120 m means corners ~84.9 m from the centre.
  v_corners := pg_temp.box_corners(-15.7894, 35.038, 120, 120);
  begin
    insert into public.geofences (
      shape, c1_lat, c1_lng, c2_lat, c2_lng,
      c3_lat, c3_lng, c4_lat, c4_lng
    ) values (
      'box',
      (v_corners -> 0 ->> 'lat')::double precision,
      (v_corners -> 0 ->> 'lng')::double precision,
      (v_corners -> 1 ->> 'lat')::double precision,
      (v_corners -> 1 ->> 'lng')::double precision,
      (v_corners -> 2 ->> 'lat')::double precision,
      (v_corners -> 2 ->> 'lng')::double precision,
      (v_corners -> 3 ->> 'lat')::double precision,
      (v_corners -> 3 ->> 'lng')::double precision
    );
    raise exception 'FAIL: oversized box was accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if position('within 50 metres' in sqlerrm) = 0 then
      raise exception 'FAIL: oversized box gave unexpected error: %', sqlerrm;
    end if;
  end;

  raise notice 'PASS: circle radius and box geometry constraints';
end $$;

-- ---------------------------------------------------------------------
-- 3. set_venue_geofence and RLS
-- ---------------------------------------------------------------------
do $$
declare
  v_venue   uuid;
  v_fence   uuid;
  v_shape   text;
  v_center  double precision;
  v_count   int;
  v_corners jsonb;
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"service_role"}',
    true
  );

  insert into public.venues (name) values ('Geo RPC Target')
  returning id into v_venue;

  -- Admin can create a circle fence.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';

  v_fence := public.set_venue_geofence(
    v_venue, 'circle', -15.7894, 35.038, 12, null
  );

  execute 'reset role';

  select g.shape, g.center_lat
  into v_shape, v_center
  from public.venues v
  join public.geofences g on g.id = v.geofence_id
  where v.id = v_venue;

  if v_shape <> 'circle' or abs(v_center - (-15.7894)) > 0.0000001 then
    raise exception 'FAIL: admin circle fence was not saved (% / %)',
      v_shape, v_center;
  end if;

  -- Admin can replace it with a box atomically.
  v_corners := pg_temp.box_corners(-15.7894, 35.038, 6, 6);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';

  v_fence := public.set_venue_geofence(
    v_venue, 'box', null, null, null, v_corners
  );

  execute 'reset role';

  select g.shape into v_shape
  from public.geofences g where g.id = v_fence;
  if v_shape <> 'box' then
    raise exception 'FAIL: admin box fence was not saved (%)', v_shape;
  end if;

  -- RPC validates radius as well as the table check.
  begin
    perform public.set_venue_geofence(
      v_venue, 'circle', -15.7894, 35.038, 1, null
    );
    raise exception 'FAIL: RPC accepted radius 1';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if position('Radius must be between 2 and 50' in sqlerrm) = 0 then
      raise exception 'FAIL: RPC radius error was unexpected: %', sqlerrm;
    end if;
  end;

  begin
    perform public.set_venue_geofence(
      v_venue, 'box', null, null, null, '[]'::jsonb
    );
    raise exception 'FAIL: RPC accepted fewer than four corners';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if position('exactly four corners' in sqlerrm) = 0 then
      raise exception 'FAIL: RPC box-count error was unexpected: %', sqlerrm;
    end if;
  end;

  -- Lecturer and student cannot read fence coordinates.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into v_count from public.geofences;
  execute 'reset role';
  if v_count <> 0 then
    raise exception 'FAIL: lecturer could read % geofence rows', v_count;
  end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into v_count from public.geofences;
  execute 'reset role';
  if v_count <> 0 then
    raise exception 'FAIL: student could read % geofence rows', v_count;
  end if;

  -- Student cannot write a fence directly or through the RPC.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';

  begin
    insert into public.geofences (shape, center_lat, center_lng, radius_m)
    values ('circle', -15.7894, 35.038, 10);
    raise exception 'FAIL: student inserted a geofence directly';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.set_venue_geofence(
      '00000000-0000-4000-8000-000000002002',
      'circle', -15.7894, 35.038, 10, null
    );
    raise exception 'FAIL: student created a fence through the RPC';
  exception when insufficient_privilege then
    null;
  end;

  execute 'reset role';

  -- Lecturer cannot write either.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';

  begin
    perform public.set_venue_geofence(
      '00000000-0000-4000-8000-000000002002',
      'circle', -15.7894, 35.038, 10, null
    );
    raise exception 'FAIL: lecturer created a fence through the RPC';
  exception when insufficient_privilege then
    null;
  end;

  execute 'reset role';

  -- Admin can read the rows.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into v_count from public.geofences;
  execute 'reset role';
  if v_count = 0 then
    raise exception 'FAIL: admin could not read any geofences';
  end if;

  raise notice 'PASS: set_venue_geofence and RLS';
end $$;

-- ---------------------------------------------------------------------
-- 4. Unique sharing, removal and venue cascade
-- ---------------------------------------------------------------------
do $$
declare
  v_a       uuid;
  v_b       uuid;
  v_c       uuid;
  v_fence_a uuid;
  v_fence_c uuid;
  v_count   int;
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"service_role"}',
    true
  );

  v_a := pg_temp.make_circle_venue('Geo Share A', -15.7894, 35.038, 10);
  v_b := pg_temp.make_circle_venue('Geo Share B', -15.7895, 35.0381, 10);
  v_c := pg_temp.make_circle_venue('Geo Cascade', -15.7896, 35.0382, 10);

  select geofence_id into v_fence_a from public.venues where id = v_a;
  select geofence_id into v_fence_c from public.venues where id = v_c;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';

  begin
    update public.venues
    set geofence_id = v_fence_a
    where id = v_b;
    raise exception 'FAIL: two venues shared one geofence';
  exception when unique_violation then
    null;
  end;

  -- Removing the fence is a plain delete; the FK clears the venue.
  delete from public.geofences where id = v_fence_a;
  execute 'reset role';

  select count(*) into v_count
  from public.venues
  where id = v_a and geofence_id is null;
  if v_count <> 1 then
    raise exception 'FAIL: deleting a geofence did not clear venues.geofence_id';
  end if;

  -- Deleting a venue deletes its fence.
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  delete from public.venues where id = v_c;
  execute 'reset role';

  select count(*) into v_count
  from public.geofences where id = v_fence_c;
  if v_count <> 0 then
    raise exception 'FAIL: deleting a venue left its geofence behind';
  end if;

  raise notice 'PASS: unique sharing, removal and venue cascade';
end $$;

-- ---------------------------------------------------------------------
-- 5. Direct attendance INSERT is closed
-- ---------------------------------------------------------------------
do $$
declare
  v_session uuid;
  v_count   int;
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"service_role"}',
    true
  );

  v_session := pg_temp.new_session(
    '00000000-0000-4000-8000-000000001001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000002002'
  );

  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';

  begin
    insert into public.attendance_records (session_id, student_id, method, status)
    values (v_session, '00000000-0000-4000-8000-000000000003', 'manual', 'present');
    raise exception 'FAIL: direct attendance INSERT was allowed';
  exception when insufficient_privilege then
    null;
  end;

  execute 'reset role';

  select count(*) into v_count
  from public.attendance_records
  where session_id = v_session;
  if v_count <> 0 then
    raise exception 'FAIL: direct INSERT left an attendance row';
  end if;

  raise notice 'PASS: direct attendance INSERT is closed';
end $$;

-- ---------------------------------------------------------------------
-- 6. Circle decision table, including gap = accuracy
-- ---------------------------------------------------------------------
do $$
declare
  v_lat      double precision := -15.7894;
  v_lng      double precision := 35.038;
  v_course   uuid := '00000000-0000-4000-8000-000000001001';
  v_lecturer uuid := '00000000-0000-4000-8000-000000000002';
  v_main     uuid;
  v_boundary uuid;
  v_small    uuid;
  v_session  uuid;
  v_point    double precision[];
  v_distance double precision;
  v_record   public.attendance_records;
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"service_role"}',
    true
  );

  v_main := pg_temp.make_circle_venue('Geo Circle Main', v_lat, v_lng, 10);

  v_point := pg_temp.point_at(v_lat, v_lng, 10, radians(90));
  v_distance := st_distance(
    st_setsrid(st_makepoint(v_point[2], v_point[1]), 4326)::geography,
    st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography
  );
  v_boundary := pg_temp.make_circle_venue(
    'Geo Circle Boundary', v_lat, v_lng, v_distance + 0.001
  );

  -- Inside: normal present, no location evidence stored.
  v_session := pg_temp.new_session(v_course, v_lecturer, v_main);
  perform pg_temp.expect_checkin(
    v_session, v_lat, v_lng, 10, 'ok:present:', 'circle inside'
  );

  select * into v_record
  from public.attendance_records
  where session_id = v_session;
  if v_record.location_distance_m is not null
     or v_record.location_accuracy_m is not null then
    raise exception 'FAIL: non-flagged check-in stored location evidence';
  end if;

  -- Point 1 mm inside the measured radius: gap = 0.
  v_session := pg_temp.new_session(v_course, v_lecturer, v_boundary);
  perform pg_temp.expect_checkin(
    v_session, v_point[1], v_point[2], 5, 'ok:present:', 'circle edge'
  );

  -- gap = accuracy (= 5): trusted fix blocks.
  v_point := pg_temp.point_at(v_lat, v_lng, 10, radians(90));
  v_distance := st_distance(
    st_setsrid(st_makepoint(v_point[2], v_point[1]), 4326)::geography,
    st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography
  );
  v_boundary := pg_temp.make_circle_venue(
    'Geo Circle Gap Equals Accuracy',
    v_lat, v_lng, v_distance - 5 + 0.001
  );
  v_session := pg_temp.new_session(v_course, v_lecturer, v_boundary);
  perform pg_temp.expect_checkin(
    v_session, v_point[1], v_point[2], 5,
    'err:outside_good_accuracy', 'circle gap = accuracy'
  );

  -- gap > accuracy: outside.
  v_point := pg_temp.point_at(v_lat, v_lng, 21, radians(90));
  v_session := pg_temp.new_session(v_course, v_lecturer, v_main);
  perform pg_temp.expect_checkin(
    v_session, v_point[1], v_point[2], 10, 'err:outside', 'circle gap > accuracy'
  );

  -- gap < accuracy and accuracy <= good limit: outside_good_accuracy.
  v_point := pg_temp.point_at(v_lat, v_lng, 14, radians(90));
  v_session := pg_temp.new_session(v_course, v_lecturer, v_main);
  perform pg_temp.expect_checkin(
    v_session, v_point[1], v_point[2], 5,
    'err:outside_good_accuracy', 'circle good-accuracy overlap'
  );

  -- gap < accuracy and accuracy > good limit: flagged and evidence stored.
  v_point := pg_temp.point_at(v_lat, v_lng, 14, radians(90));
  v_session := pg_temp.new_session(v_course, v_lecturer, v_main);
  perform pg_temp.expect_checkin(
    v_session, v_point[1], v_point[2], 20,
    'ok:flagged:low_accuracy_overlap', 'circle poor-accuracy overlap'
  );

  select * into v_record
  from public.attendance_records
  where session_id = v_session;
  if v_record.flag_reason <> 'low_accuracy_overlap' then
    raise exception 'FAIL: flagged record has reason %', v_record.flag_reason;
  end if;
  if v_record.location_distance_m is null
     or v_record.location_accuracy_m is null then
    raise exception 'FAIL: flagged record did not store distance/accuracy';
  end if;
  if v_record.location_accuracy_m <> 20 then
    raise exception 'FAIL: flagged record stored accuracy %, expected 20',
      v_record.location_accuracy_m;
  end if;
  if v_record.location_distance_m < 3.9
     or v_record.location_distance_m > 4.1 then
    raise exception 'FAIL: flagged record stored gap %, expected ~4',
      v_record.location_distance_m;
  end if;

  -- Accuracy ceiling: exactly 200 m is usable; 200.01 m is no_location.
  v_session := pg_temp.new_session(v_course, v_lecturer, v_main);
  perform pg_temp.expect_checkin(
    v_session, v_lat, v_lng, 200, 'ok:present:', 'accuracy 200 usable'
  );
  v_session := pg_temp.new_session(v_course, v_lecturer, v_main);
  v_point := pg_temp.point_at(v_lat, v_lng, 1, radians(90));
  perform pg_temp.expect_checkin(
    v_session, v_point[1], v_point[2], 200.01,
    'err:no_location', 'accuracy 200.01'
  );

  -- Good/poor boundary: gap ~4 m, good_limit = 10 (circle radius 10).
  v_point := pg_temp.point_at(v_lat, v_lng, 14, radians(90));
  v_session := pg_temp.new_session(v_course, v_lecturer, v_main);
  perform pg_temp.expect_checkin(
    v_session, v_point[1], v_point[2], 10,
    'err:outside_good_accuracy', 'accuracy 10 boundary blocked'
  );
  v_session := pg_temp.new_session(v_course, v_lecturer, v_main);
  perform pg_temp.expect_checkin(
    v_session, v_point[1], v_point[2], 10.1,
    'ok:flagged:low_accuracy_overlap', 'accuracy 10.1 boundary flagged'
  );

  -- Invalid location: NULL and NaN.
  v_session := pg_temp.new_session(v_course, v_lecturer, v_main);
  perform pg_temp.expect_checkin(
    v_session, null, null, 10, 'err:no_location', 'NULL location'
  );
  perform pg_temp.expect_checkin(
    v_session, 'NaN'::double precision, v_point[2], 10,
    'err:no_location', 'NaN latitude'
  );

  -- Venue without a fence blocks check-in.
  v_session := pg_temp.new_session(
    v_course, v_lecturer, '00000000-0000-4000-8000-000000002002'
  );
  v_point := pg_temp.point_at(v_lat, v_lng, 1, radians(90));
  perform pg_temp.expect_checkin(
    v_session, v_point[1], v_point[2], 10, 'err:no_geofence', 'no fence'
  );

  -- Small circle (r = 5, good_limit = 5).
  v_small := pg_temp.make_circle_venue(
    'Geo Small Circle', v_lat, v_lng, 5.000001
  );

  v_session := pg_temp.new_session(v_course, v_lecturer, v_small);
  perform pg_temp.expect_checkin(
    v_session, v_lat, v_lng, 10, 'ok:present:', 'small circle inside'
  );

  -- gap ~3, accuracy 10 > good_limit: flagged, not blocked.
  v_point := pg_temp.point_at(v_lat, v_lng, 8, radians(90));
  v_session := pg_temp.new_session(v_course, v_lecturer, v_small);
  perform pg_temp.expect_checkin(
    v_session, v_point[1], v_point[2], 10,
    'ok:flagged:low_accuracy_overlap', 'small circle poor accuracy'
  );

  -- gap ~3, accuracy 5 <= good_limit: blocked.
  v_session := pg_temp.new_session(v_course, v_lecturer, v_small);
  perform pg_temp.expect_checkin(
    v_session, v_point[1], v_point[2], 5,
    'err:outside_good_accuracy', 'small circle good accuracy'
  );

  -- gap ~10 = accuracy at the minimum-size boundary: flagged, not blocked.
  v_point := pg_temp.point_at(v_lat, v_lng, 15, radians(90));
  v_session := pg_temp.new_session(v_course, v_lecturer, v_small);
  perform pg_temp.expect_checkin(
    v_session, v_point[1], v_point[2], 10,
    'ok:flagged:low_accuracy_overlap', 'small circle gap = accuracy'
  );

  -- gap > accuracy: outside.
  v_point := pg_temp.point_at(v_lat, v_lng, 16, radians(90));
  v_session := pg_temp.new_session(v_course, v_lecturer, v_small);
  perform pg_temp.expect_checkin(
    v_session, v_point[1], v_point[2], 10,
    'err:outside', 'small circle outside'
  );

  raise notice 'PASS: circle decision table and small-fence cases';
end $$;

-- ---------------------------------------------------------------------
-- 7. Box decision table and clockwise/anticlockwise equality
-- ---------------------------------------------------------------------
do $$
declare
  v_lat       double precision := -15.7894;
  v_lng       double precision := 35.038;
  v_course    uuid := '00000000-0000-4000-8000-000000001001';
  v_lecturer  uuid := '00000000-0000-4000-8000-000000000002';
  v_corners   jsonb;
  v_box_ccw   uuid;
  v_box_cw    uuid;
  v_session_a uuid;
  v_session_b uuid;
  v_point     double precision[];
  v_record    public.attendance_records;
  v_result_a  text;
  v_result_b  text;
begin
  perform set_config(
    'request.jwt.claims',
    '{"role":"service_role"}',
    true
  );

  v_corners := pg_temp.box_corners(v_lat, v_lng, 6, 6);
  v_box_ccw := pg_temp.make_box_venue('Geo Box CCW', v_corners);
  v_box_cw := pg_temp.make_box_venue(
    'Geo Box CW', pg_temp.reverse_corners(v_corners)
  );

  -- Inside: present.
  v_session_a := pg_temp.new_session(v_course, v_lecturer, v_box_ccw);
  perform pg_temp.expect_checkin(
    v_session_a, v_lat, v_lng, 10, 'ok:present:', 'box inside'
  );

  -- ~1 m outside, accuracy 5 > half_size (3): flagged.
  v_point := pg_temp.point_at(v_lat, v_lng, 4, radians(90));
  v_session_a := pg_temp.new_session(v_course, v_lecturer, v_box_ccw);
  perform pg_temp.expect_checkin(
    v_session_a, v_point[1], v_point[2], 5,
    'ok:flagged:low_accuracy_overlap', 'box poor accuracy overlap'
  );

  select * into v_record
  from public.attendance_records
  where session_id = v_session_a;
  if v_record.location_distance_m is null
     or v_record.location_distance_m < 0.8
     or v_record.location_distance_m > 1.2 then
    raise exception 'FAIL: box flagged gap was % (expected ~1)',
      v_record.location_distance_m;
  end if;

  -- ~2.9 m outside, accuracy 2.95 <= half_size: blocked.
  v_point := pg_temp.point_at(v_lat, v_lng, 5.9, radians(90));
  v_session_a := pg_temp.new_session(v_course, v_lecturer, v_box_ccw);
  perform pg_temp.expect_checkin(
    v_session_a, v_point[1], v_point[2], 2.95,
    'err:outside_good_accuracy', 'box gap ~ accuracy'
  );

  -- ~4 m outside, accuracy 3: outside.
  v_point := pg_temp.point_at(v_lat, v_lng, 7, radians(90));
  v_session_a := pg_temp.new_session(v_course, v_lecturer, v_box_ccw);
  perform pg_temp.expect_checkin(
    v_session_a, v_point[1], v_point[2], 3,
    'err:outside', 'box gap > accuracy'
  );

  -- Clockwise and anticlockwise rings behave identically.
  v_point := pg_temp.point_at(v_lat, v_lng, 4, radians(90));
  v_session_a := pg_temp.new_session(v_course, v_lecturer, v_box_ccw);
  v_session_b := pg_temp.new_session(v_course, v_lecturer, v_box_cw);
  v_result_a := pg_temp.try_checkin(
    v_session_a, '00000000-0000-4000-8000-000000000003',
    v_point[1], v_point[2], 5
  );
  v_result_b := pg_temp.try_checkin(
    v_session_b, '00000000-0000-4000-8000-000000000003',
    v_point[1], v_point[2], 5
  );
  if v_result_a <> 'ok:flagged:low_accuracy_overlap'
     or v_result_b <> v_result_a then
    raise exception 'FAIL: CW/CCW boxes differ (% vs %)',
      v_result_a, v_result_b;
  end if;

  v_point := pg_temp.point_at(v_lat, v_lng, 1, radians(90));
  v_session_a := pg_temp.new_session(v_course, v_lecturer, v_box_ccw);
  v_session_b := pg_temp.new_session(v_course, v_lecturer, v_box_cw);
  v_result_a := pg_temp.try_checkin(
    v_session_a, '00000000-0000-4000-8000-000000000003',
    v_point[1], v_point[2], 10
  );
  v_result_b := pg_temp.try_checkin(
    v_session_b, '00000000-0000-4000-8000-000000000003',
    v_point[1], v_point[2], 10
  );
  if v_result_a <> 'ok:present:' or v_result_b <> v_result_a then
    raise exception 'FAIL: CW/CCW inside results differ (% vs %)',
      v_result_a, v_result_b;
  end if;

  raise notice 'PASS: box decision table and CW/CCW equality';
end $$;

rollback;

-- =====================================================================
-- All fixtures rolled back. Expected notices:
--   PASS: schema, function signatures and privileges
--   PASS: circle radius and box geometry constraints
--   PASS: set_venue_geofence and RLS
--   PASS: unique sharing, removal and venue cascade
--   PASS: direct attendance INSERT is closed
--   PASS: circle decision table and small-fence cases
--   PASS: box decision table and CW/CCW equality
-- =====================================================================
