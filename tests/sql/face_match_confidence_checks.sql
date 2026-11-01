-- =====================================================================
-- Class-BARS face match confidence checks
--
-- MANUAL TEST. Run in the Supabase SQL Editor as postgres after applying
-- migrations/31_fix_box_geofence_contains.sql and
-- migrations/33_face_match_confidence.sql.
--
-- The script creates temporary fixtures, exercises the score function and
-- both check-in RPC overloads, then rolls everything back.
-- =====================================================================

begin;

select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_user_meta_data, is_anonymous
) values
  ('00000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated',
   'face-admin@example.invalid', now(), '{"full_name":"Face Admin"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated',
   'face-lecturer@example.invalid', now(), '{"full_name":"Face Lecturer"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000103', 'authenticated', 'authenticated',
   'face-student@example.invalid', now(), '{"full_name":"Face Student"}'::jsonb, false)
on conflict (id) do nothing;

insert into public.profiles (id, full_name, role, student_number) values
  ('00000000-0000-4000-8000-000000000101', 'Face Admin', 'admin', null),
  ('00000000-0000-4000-8000-000000000102', 'Face Lecturer', 'lecturer', null),
  ('00000000-0000-4000-8000-000000000103', 'Face Student', 'student', 'FACE-S1')
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    student_number = excluded.student_number;

insert into public.courses (id, course_code, course_name)
values (
  '00000000-0000-4000-8000-000000001101',
  'FACE-CHECK-101',
  'Face confidence test course'
)
on conflict (id) do update set course_name = excluded.course_name;

insert into public.enrollments (student_id, course_id, academic_year, semester)
values (
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000001101',
  '2026',
  '1'
)
on conflict (student_id, course_id, academic_year, semester) do nothing;

insert into public.venues (id, name)
values ('00000000-0000-4000-8000-000000002101', 'Face Test Room')
on conflict (id) do update set name = excluded.name;

insert into public.geofences (id, shape, center_lat, center_lng, radius_m)
values (
  '00000000-0000-4000-8000-000000003101',
  'circle',
  -33.9249,
  18.4241,
  10
)
on conflict (id) do update
set shape = excluded.shape,
    center_lat = excluded.center_lat,
    center_lng = excluded.center_lng,
    radius_m = excluded.radius_m;

update public.venues
set geofence_id = '00000000-0000-4000-8000-000000003101'
where id = '00000000-0000-4000-8000-000000002101';

create function pg_temp.new_session() returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.class_sessions (
    course_id, lecturer_id, venue_id, scheduled_start, scheduled_end, status
  ) values (
    '00000000-0000-4000-8000-000000001101',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000002101',
    now(),
    now() + interval '1 hour',
    'ongoing'
  )
  returning id into v_id;
  return v_id;
end;
$$;

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

do $$
declare
  v_student   uuid := '00000000-0000-4000-8000-000000000103';
  v_admin     uuid := '00000000-0000-4000-8000-000000000101';
  v_lecturer  uuid := '00000000-0000-4000-8000-000000000102';
  v_lat       double precision := -33.9249;
  v_lng       double precision := 18.4241;
  v_point     double precision[];
  v_session   uuid;
  v_result    jsonb;
  v_record    public.attendance_records;
  v_score     numeric;
  v_band      text;
  v_version   text;
  v_count     int;
  v_audit_before bigint;
  v_audit_after  bigint;
begin
  -- -------------------------------------------------------------------
  -- Score function: values and bands.
  -- -------------------------------------------------------------------
  select score, band, config_version
  into v_score, v_band, v_version
  from public.face_match_score(0.40);
  if abs(v_score - 0.945219) > 0.0001 or v_band <> 'accept'
     or v_version <> 'face-api-recognition-full68-v1' then
    raise exception 'FAIL: score 0.40 got %, %, %', v_score, v_band, v_version;
  end if;

  select score, band into v_score, v_band
  from public.face_match_score(0.45);
  if abs(v_score - 0.864656) > 0.0001 or v_band <> 'accept' then
    raise exception 'FAIL: score 0.45 got %, %', v_score, v_band;
  end if;

  select score, band into v_score, v_band
  from public.face_match_score(0.50);
  if abs(v_score - 0.702859) > 0.0001 or v_band <> 'review' then
    raise exception 'FAIL: score 0.50 got %, %', v_score, v_band;
  end if;

  select score, band into v_score, v_band
  from public.face_match_score(0.55);
  if abs(v_score - 0.466895) > 0.0001 or v_band <> 'retry' then
    raise exception 'FAIL: score 0.55 got %, %', v_score, v_band;
  end if;

  select score, band into v_score, v_band
  from public.face_match_score(0.60);
  if abs(v_score - 0.244867) > 0.0001 or v_band <> 'retry' then
    raise exception 'FAIL: score 0.60 got %, %', v_score, v_band;
  end if;

  -- Cutoff neighbourhoods: just above/below accept and review.
  select band into v_band from public.face_match_score(0.4734);
  if v_band <> 'accept' then
    raise exception 'FAIL: accept cutoff below got %', v_band;
  end if;
  select band into v_band from public.face_match_score(0.4737);
  if v_band <> 'review' then
    raise exception 'FAIL: accept cutoff above got %', v_band;
  end if;
  select band into v_band from public.face_match_score(0.5228);
  if v_band <> 'review' then
    raise exception 'FAIL: review cutoff below got %', v_band;
  end if;
  select band into v_band from public.face_match_score(0.5231);
  if v_band <> 'retry' then
    raise exception 'FAIL: review cutoff above got %', v_band;
  end if;

  -- Invalid distances.
  begin
    perform 1 from public.face_match_score(null::double precision);
    raise exception 'FAIL: NULL distance accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform 1 from public.face_match_score('NaN'::double precision);
    raise exception 'FAIL: NaN distance accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform 1 from public.face_match_score(-0.1);
    raise exception 'FAIL: negative distance accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform 1 from public.face_match_score(11);
    raise exception 'FAIL: huge distance accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- -------------------------------------------------------------------
  -- Face accept: present, score stored.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_student, 'role', 'authenticated')::text,
    true
  );

  v_session := pg_temp.new_session();
  v_result := public.check_in_attendance(
    v_session, v_student, null, 'face', null, v_lat, v_lng, 5, 0.40
  );
  if v_result ->> 'outcome' <> 'accept' then
    raise exception 'FAIL: accept outcome %', v_result ->> 'outcome';
  end if;
  if v_result ->> 'band' <> 'accept' then
    raise exception 'FAIL: accept band %', v_result ->> 'band';
  end if;
  select * into v_record
  from public.attendance_records
  where session_id = v_session;
  if v_record.status <> 'present' or v_record.flag_reason is not null then
    raise exception 'FAIL: accept stored status %, reason %',
      v_record.status, v_record.flag_reason;
  end if;
  if abs(v_record.match_score - 0.945219) > 0.0001
     or v_record.match_band <> 'accept'
     or v_record.match_distance <> 0.40
     or v_record.match_config_version <> 'face-api-recognition-full68-v1' then
    raise exception 'FAIL: accept match columns score %, band %, distance %, version %',
      v_record.match_score, v_record.match_band,
      v_record.match_distance, v_record.match_config_version;
  end if;

  -- -------------------------------------------------------------------
  -- Face review: flagged, face_review reason, no location evidence.
  -- -------------------------------------------------------------------
  v_session := pg_temp.new_session();
  v_result := public.check_in_attendance(
    v_session, v_student, null, 'face', null, v_lat, v_lng, 5, 0.50
  );
  if v_result ->> 'outcome' <> 'review' then
    raise exception 'FAIL: review outcome %', v_result ->> 'outcome';
  end if;
  select * into v_record
  from public.attendance_records
  where session_id = v_session;
  if v_record.status <> 'flagged' or v_record.flag_reason <> 'face_review' then
    raise exception 'FAIL: review stored status %, reason %',
      v_record.status, v_record.flag_reason;
  end if;
  if v_record.location_distance_m is not null
     or v_record.location_accuracy_m is not null then
    raise exception 'FAIL: review stored location evidence';
  end if;
  if v_record.match_band <> 'review'
     or abs(v_record.match_score - 0.702859) > 0.0001 then
    raise exception 'FAIL: review match columns %, %',
      v_record.match_band, v_record.match_score;
  end if;

  -- -------------------------------------------------------------------
  -- Face retry: no row.
  -- -------------------------------------------------------------------
  v_session := pg_temp.new_session();
  v_result := public.check_in_attendance(
    v_session, v_student, null, 'face', null, v_lat, v_lng, 5, 0.60
  );
  if v_result ->> 'outcome' <> 'retry' or v_result ? 'record' then
    raise exception 'FAIL: retry result %', v_result;
  end if;
  select count(*) into v_count
  from public.attendance_records
  where session_id = v_session;
  if v_count <> 0 then
    raise exception 'FAIL: retry recorded % rows', v_count;
  end if;

  -- -------------------------------------------------------------------
  -- Location flag + face review: both reasons coexist.
  -- -------------------------------------------------------------------
  v_point := pg_temp.point_at(v_lat, v_lng, 14, radians(90));
  v_session := pg_temp.new_session();
  v_result := public.check_in_attendance(
    v_session, v_student, null, 'face', null,
    v_point[1], v_point[2], 20, 0.50
  );
  if v_result ->> 'outcome' <> 'review' then
    raise exception 'FAIL: combined outcome %', v_result ->> 'outcome';
  end if;
  select * into v_record
  from public.attendance_records
  where session_id = v_session;
  if v_record.flag_reason <> 'low_accuracy_overlap,face_review' then
    raise exception 'FAIL: combined reason %', v_record.flag_reason;
  end if;
  if v_record.location_distance_m is null
     or v_record.location_accuracy_m is null then
    raise exception 'FAIL: combined location evidence missing';
  end if;
  if v_record.match_band <> 'review' then
    raise exception 'FAIL: combined band %', v_record.match_band;
  end if;

  -- -------------------------------------------------------------------
  -- The 8-argument RPC still rejects face, and still serves manual/OTP.
  -- -------------------------------------------------------------------
  v_session := pg_temp.new_session();
  begin
    perform public.check_in_attendance(
      v_session, v_student, null, 'face', null, v_lat, v_lng, 5
    );
    raise exception 'FAIL: 8-argument face check-in was accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm <> 'face_distance_required' then
      raise exception 'FAIL: 8-argument face error %', sqlerrm;
    end if;
  end;

  v_session := pg_temp.new_session();
  v_record := public.check_in_attendance(
    v_session, v_student, null, 'manual', 1.0, v_lat, v_lng, 5
  );
  if v_record.status <> 'present'
     or v_record.match_distance is not null
     or v_record.match_score is not null
     or v_record.match_band is not null
     or v_record.match_config_version is not null then
    raise exception 'FAIL: manual match columns were not null';
  end if;

  v_session := pg_temp.new_session();
  v_record := public.check_in_attendance(
    v_session, v_student, null, 'otp', 1.0, v_lat, v_lng, 5
  );
  if v_record.status <> 'present'
     or v_record.match_distance is not null
     or v_record.match_score is not null
     or v_record.match_band is not null
     or v_record.match_config_version is not null then
    raise exception 'FAIL: OTP match columns were not null';
  end if;

  -- -------------------------------------------------------------------
  -- Lecturer roster exposes match_score.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_lecturer, 'role', 'authenticated')::text,
    true
  );
  select match_score into v_score
  from public.get_session_attendance(
    (select session_id from public.attendance_records
     where student_id = v_student and match_band = 'accept'
     order by check_in_time desc limit 1)
  )
  limit 1;
  if v_score is null or abs(v_score - 0.945219) > 0.0001 then
    raise exception 'FAIL: lecturer roster match_score %', v_score;
  end if;

  -- -------------------------------------------------------------------
  -- Admin config update + audit; invalid config rejected.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  select count(*) into v_audit_before from public.audit_logs;
  perform public.set_face_match_config(
    'face-api-recognition-full68-v1',
    19.8713,
    -10.7966,
    0.80,
    0.60,
    'test update',
    now()
  );
  select count(*) into v_audit_after from public.audit_logs;
  if v_audit_after <> v_audit_before + 1 then
    raise exception 'FAIL: config audit count % -> %', v_audit_before, v_audit_after;
  end if;

  begin
    perform public.set_face_match_config(
      'bad', 19.8713, -10.7966, 0.50, 0.60, 'bad scores', now()
    );
    raise exception 'FAIL: review >= accept config accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  begin
    perform public.set_face_match_config(
      'bad', 'NaN'::numeric, -10.7966, 0.80, 0.60, 'bad a', now()
    );
    raise exception 'FAIL: NaN config accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  begin
    perform public.set_face_match_config(
      'bad', 19.8713, -10.7966, 0.80, 0.60, '', now()
    );
    raise exception 'FAIL: empty source note accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  end;
$$;

-- =====================================================================
-- Additional coverage: revision traceability, validation, stripping,
-- prerequisites, and RLS.
-- =====================================================================
do $$
declare
  v_student   uuid := '00000000-0000-4000-8000-000000000103';
  v_admin     uuid := '00000000-0000-4000-8000-000000000101';
  v_lecturer  uuid := '00000000-0000-4000-8000-000000000102';
  v_lat       double precision := -33.9249;
  v_lng       double precision := 18.4241;
  v_session   uuid;
  v_result    jsonb;
  v_rev       bigint;
  v_rev2      bigint;
  v_count     int;
begin
  -- -------------------------------------------------------------------
  -- Revision traceability: config_revision increments on each update.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  select config_revision into v_rev from public.face_match_config where singleton;
  perform public.set_face_match_config(
    'face-api-recognition-full68-v1',
    19.8713,
    -10.7966,
    0.80,
    0.60,
    'revision test',
    now()
  );
  select config_revision into v_rev2 from public.face_match_config where singleton;
  if v_rev2 is null or v_rev2 <> v_rev + 1 then
    raise exception 'FAIL: config_revision did not increment: % -> %', v_rev, v_rev2;
  end if;

  select count(*) into v_count
  from public.audit_logs
  where action = 'face_match_config.update'
    and (metadata ->> 'revision')::bigint = v_rev2;
  if v_count <> 1 then
    raise exception 'FAIL: config audit revision missing (% rows)', v_count;
  end if;

  -- -------------------------------------------------------------------
  -- Config validation: reject out-of-range / malformed values.
  -- -------------------------------------------------------------------
  begin
    perform public.set_face_match_config(
      null, 19.8713, -10.7966, 0.80, 0.60, 'null model', now()
    );
    raise exception 'FAIL: null model_version accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform public.set_face_match_config(
      'x', 19.8713, -10.7966, 1.00, 0.60, 'accept=1', now()
    );
    raise exception 'FAIL: accept_score=1 accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform public.set_face_match_config(
      'x', 19.8713, -10.7966, 0.80, 0.00, 'review=0', now()
    );
    raise exception 'FAIL: review_score=0 accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform public.set_face_match_config(
      'x', 19.8713, -10.7966, 0.80, 0.80, 'review=accept', now()
    );
    raise exception 'FAIL: review=accept accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- -------------------------------------------------------------------
  -- Stripping: student check-in record must not contain match_* fields.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_student, 'role', 'authenticated')::text,
    true
  );
  v_session := pg_temp.new_session();
  v_result := public.check_in_attendance(
    v_session, v_student, null, 'face', null, v_lat, v_lng, 5, 0.40
  );
  if v_result ->> 'outcome' <> 'accept' then
    raise exception 'FAIL: stripping accept outcome %', v_result ->> 'outcome';
  end if;
  if (v_result -> 'record') ? 'match_score'
     or (v_result -> 'record') ? 'match_distance'
     or (v_result -> 'record') ? 'match_band'
     or (v_result -> 'record') ? 'match_config_version' then
    raise exception 'FAIL: match fields leaked into student check-in record';
  end if;

  -- -------------------------------------------------------------------
  -- Prerequisites: non-admin cannot update config.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_lecturer, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.set_face_match_config(
      'x', 19.8713, -10.7966, 0.80, 0.60, 'lecturer update', now()
    );
    raise exception 'FAIL: lecturer config update accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- -------------------------------------------------------------------
  -- RLS: config read is admin-only.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_student, 'role', 'authenticated')::text,
    true
  );
  select count(*) into v_count from public.face_match_config;
  if v_count <> 0 then
    raise exception 'FAIL: student can read face_match_config (% rows)', v_count;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  select count(*) into v_count from public.face_match_config;
  if v_count <> 1 then
    raise exception 'FAIL: admin cannot read face_match_config (% rows)', v_count;
  end if;
end;
$$;

rollback;
