-- =====================================================================
-- Class-BARS Migration 12: geofencing (PostGIS proximity check)
--
-- EDITED IN PLACE on 2026-10-23: this migration had NOT been executed on
-- the live database, so the geofence shape/radius changes were folded into
-- this file instead of writing a follow-up migration.
--
-- Applies on top of 01–11 and DEPENDS ON 11 (admin venue RLS).
-- Migrations are applied by hand in the Supabase SQL Editor. Apply
-- migrations/08_course_lecturer.sql, 10_staff_email_allowlist.sql and
-- 11_admin_section_rls.sql BEFORE this file.
--
-- Geofencing is a proximity check that runs alongside the face match.
-- It is not proof of presence. Only the gap and reported accuracy are
-- stored; raw student coordinates are never persisted (DPA minimisation).
--
-- Re-runnable (idempotent). Run in the SQL Editor as postgres.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. PostGIS (geography distances in metres)
-- ---------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Geofences: one row per venue, either a circle or a class box.
-- ---------------------------------------------------------------------
create table if not exists public.geofences (
  id           uuid primary key default gen_random_uuid(),
  shape        text not null,
  center_lat   double precision,
  center_lng   double precision,
  radius_m     numeric,
  c1_lat       double precision,
  c1_lng       double precision,
  c2_lat       double precision,
  c2_lng       double precision,
  c3_lat       double precision,
  c3_lng       double precision,
  c4_lat       double precision,
  c4_lng       double precision,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references public.profiles(id),

  constraint geofences_shape_check
    check (shape in ('circle', 'box')),

  constraint geofences_coordinates_check
    check (
      (center_lat is null or center_lat between -90 and 90)
      and (center_lng is null or center_lng between -180 and 180)
      and (c1_lat is null or c1_lat between -90 and 90)
      and (c1_lng is null or c1_lng between -180 and 180)
      and (c2_lat is null or c2_lat between -90 and 90)
      and (c2_lng is null or c2_lng between -180 and 180)
      and (c3_lat is null or c3_lat between -90 and 90)
      and (c3_lng is null or c3_lng between -180 and 180)
      and (c4_lat is null or c4_lat between -90 and 90)
      and (c4_lng is null or c4_lng between -180 and 180)
    ),

  constraint geofences_shape_fields_check
    check (
      (
        shape = 'circle'
        and center_lat is not null
        and center_lng is not null
        and radius_m is not null
        and radius_m between 2 and 50
        and c1_lat is null and c1_lng is null
        and c2_lat is null and c2_lng is null
        and c3_lat is null and c3_lng is null
        and c4_lat is null and c4_lng is null
      )
      or
      (
        shape = 'box'
        and center_lat is null
        and center_lng is null
        and radius_m is null
        and c1_lat is not null and c1_lng is not null
        and c2_lat is not null and c2_lng is not null
        and c3_lat is not null and c3_lng is not null
        and c4_lat is not null and c4_lng is not null
      )
    )
);

comment on table public.geofences is
  'One fence per venue: a circle (centre + radius) or a four-corner class box.';
comment on column public.geofences.created_by is
  'Admin who last created the fence; auth.uid() at insert time.';

-- Box validation: valid ring, at least 4 m2, corners not more than 50 m
-- from the centroid. Circles are handled by the table checks above.
create or replace function public.validate_geofence_box()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_polygon  geometry;
  v_centroid geography;
begin
  if new.shape <> 'box' then
    return new;
  end if;

  v_polygon := st_setsrid(
    st_makepolygon(
      st_makeline(array[
        st_makepoint(new.c1_lng, new.c1_lat),
        st_makepoint(new.c2_lng, new.c2_lat),
        st_makepoint(new.c3_lng, new.c3_lat),
        st_makepoint(new.c4_lng, new.c4_lat),
        st_makepoint(new.c1_lng, new.c1_lat)
      ])
    ),
    4326
  );

  if not st_isvalid(v_polygon) then
    raise exception 'Box corners are crossed, collinear or otherwise invalid';
  end if;

  if st_area(v_polygon::geography) < 4 then
    raise exception 'Box must be at least 4 square metres';
  end if;

  v_centroid := st_centroid(v_polygon)::geography;

  if st_distance(
       v_centroid,
       st_setsrid(st_makepoint(new.c1_lng, new.c1_lat), 4326)::geography
     ) > 50
     or st_distance(
       v_centroid,
       st_setsrid(st_makepoint(new.c2_lng, new.c2_lat), 4326)::geography
     ) > 50
     or st_distance(
       v_centroid,
       st_setsrid(st_makepoint(new.c3_lng, new.c3_lat), 4326)::geography
     ) > 50
     or st_distance(
       v_centroid,
       st_setsrid(st_makepoint(new.c4_lng, new.c4_lat), 4326)::geography
     ) > 50 then
    raise exception 'Every box corner must be within 50 metres of the box centre';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_geofence_box on public.geofences;
create trigger trg_validate_geofence_box
  before insert or update on public.geofences
  for each row
  execute function public.validate_geofence_box();

-- ---------------------------------------------------------------------
-- 2. Venues reference one geofence. The old inline geofence columns from
--    the first draft of this migration are removed.
-- ---------------------------------------------------------------------
alter table public.venues
  add column if not exists geofence_id uuid;

alter table public.venues
  drop constraint if exists venues_geofence_id_fkey;
alter table public.venues
  add constraint venues_geofence_id_fkey
  foreign key (geofence_id) references public.geofences(id) on delete set null;

create unique index if not exists venues_geofence_id_key
  on public.venues(geofence_id);

alter table public.venues
  drop column if exists latitude,
  drop column if exists longitude,
  drop column if exists geofence_radius_m;

-- Deleting a venue removes its fence too, so no orphan fences remain.
create or replace function public.delete_venue_geofence()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.geofence_id is not null then
    delete from public.geofences where id = old.geofence_id;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_delete_venue_geofence on public.venues;
create trigger trg_delete_venue_geofence
  after delete on public.venues
  for each row
  execute function public.delete_venue_geofence();

-- ---------------------------------------------------------------------
-- 3. Access: only admins can read or write fence coordinates. Students
--    and lecturers have no policy at all. The check-in RPC is SECURITY
--    DEFINER and can still read the table.
-- ---------------------------------------------------------------------
alter table public.geofences enable row level security;

grant select, insert, update, delete on table public.geofences to authenticated;
revoke all on table public.geofences from public, anon;

drop policy if exists "Admins read geofences" on public.geofences;
create policy "Admins read geofences"
  on public.geofences for select
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role = 'admin'
    )
  );

drop policy if exists "Admins insert geofences" on public.geofences;
create policy "Admins insert geofences"
  on public.geofences for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role = 'admin'
    )
  );

drop policy if exists "Admins update geofences" on public.geofences;
create policy "Admins update geofences"
  on public.geofences for update
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role = 'admin'
    )
  );

drop policy if exists "Admins delete geofences" on public.geofences;
create policy "Admins delete geofences"
  on public.geofences for delete
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role = 'admin'
    )
  );

-- Table-level grants cover all venue columns; repeat explicitly so a
-- fresh/custom grant setup cannot leave geofence_id unreadable.
grant select, insert, update, delete on table public.venues to authenticated;
grant select on table public.venues to anon;

-- Migration 11's venue write policies use auth.role() = 'authenticated',
-- which lets ANY signed-in user edit fences. These restrictive policies
-- narrow venue writes to admins so the geofence cannot be moved by the
-- students it is meant to check. Existing permissive policies remain.
drop policy if exists "Admins insert venues" on public.venues;
create policy "Admins insert venues"
  on public.venues as restrictive for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role = 'admin'
    )
  );

drop policy if exists "Admins update venues" on public.venues;
create policy "Admins update venues"
  on public.venues as restrictive for update
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role = 'admin'
    )
  );

drop policy if exists "Admins delete venues" on public.venues;
create policy "Admins delete venues"
  on public.venues as restrictive for delete
  using (
    exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and role = 'admin'
    )
  );

-- ---------------------------------------------------------------------
-- 4. Atomic geofence write from the admin UI. SECURITY INVOKER, so the
--    admin RLS policies above still apply.
-- ---------------------------------------------------------------------
create or replace function public.set_venue_geofence(
  p_venue_id  uuid,
  p_shape     text,
  p_lat       double precision,
  p_lng       double precision,
  p_radius_m  numeric,
  p_corners   jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_venue   venues;
  v_fence   uuid;
  v_c1_lat  double precision;
  v_c1_lng  double precision;
  v_c2_lat  double precision;
  v_c2_lng  double precision;
  v_c3_lat  double precision;
  v_c3_lng  double precision;
  v_c4_lat  double precision;
  v_c4_lng  double precision;
begin
  if p_shape not in ('circle', 'box') then
    raise exception 'Shape must be circle or box';
  end if;

  select * into v_venue
  from public.venues
  where id = p_venue_id;

  if v_venue.id is null then
    raise exception 'Venue not found';
  end if;

  if v_venue.geofence_id is not null then
    select id into v_fence
    from public.geofences
    where id = v_venue.geofence_id;
  end if;

  if p_shape = 'circle' then
    if p_lat is null or p_lng is null or p_radius_m is null then
      raise exception 'Circle needs a centre and radius';
    end if;
    if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      raise exception 'Circle centre is out of range';
    end if;
    if p_radius_m < 2 or p_radius_m > 50 then
      raise exception 'Radius must be between 2 and 50 metres';
    end if;

    if v_fence is null then
      insert into public.geofences (
        shape, center_lat, center_lng, radius_m
      ) values (
        'circle', p_lat, p_lng, p_radius_m
      )
      returning id into v_fence;
    else
      update public.geofences
      set shape = 'circle',
          center_lat = p_lat,
          center_lng = p_lng,
          radius_m = p_radius_m,
          c1_lat = null, c1_lng = null,
          c2_lat = null, c2_lng = null,
          c3_lat = null, c3_lng = null,
          c4_lat = null, c4_lng = null,
          updated_at = now()
      where id = v_fence;
    end if;
  else
    if p_corners is null
       or jsonb_typeof(p_corners) <> 'array'
       or jsonb_array_length(p_corners) <> 4 then
      raise exception 'A class box needs exactly four corners';
    end if;

    v_c1_lat := (p_corners -> 0 ->> 'lat')::double precision;
    v_c1_lng := (p_corners -> 0 ->> 'lng')::double precision;
    v_c2_lat := (p_corners -> 1 ->> 'lat')::double precision;
    v_c2_lng := (p_corners -> 1 ->> 'lng')::double precision;
    v_c3_lat := (p_corners -> 2 ->> 'lat')::double precision;
    v_c3_lng := (p_corners -> 2 ->> 'lng')::double precision;
    v_c4_lat := (p_corners -> 3 ->> 'lat')::double precision;
    v_c4_lng := (p_corners -> 3 ->> 'lng')::double precision;

    if v_c1_lat is null or v_c1_lng is null
       or v_c2_lat is null or v_c2_lng is null
       or v_c3_lat is null or v_c3_lng is null
       or v_c4_lat is null or v_c4_lng is null then
      raise exception 'Each box corner needs lat and lng';
    end if;

    if v_c1_lat not between -90 and 90
       or v_c2_lat not between -90 and 90
       or v_c3_lat not between -90 and 90
       or v_c4_lat not between -90 and 90
       or v_c1_lng not between -180 and 180
       or v_c2_lng not between -180 and 180
       or v_c3_lng not between -180 and 180
       or v_c4_lng not between -180 and 180 then
      raise exception 'A box corner is out of range';
    end if;

    if v_fence is null then
      insert into public.geofences (
        shape,
        c1_lat, c1_lng, c2_lat, c2_lng,
        c3_lat, c3_lng, c4_lat, c4_lng
      ) values (
        'box',
        v_c1_lat, v_c1_lng, v_c2_lat, v_c2_lng,
        v_c3_lat, v_c3_lng, v_c4_lat, v_c4_lng
      )
      returning id into v_fence;
    else
      update public.geofences
      set shape = 'box',
          center_lat = null,
          center_lng = null,
          radius_m = null,
          c1_lat = v_c1_lat, c1_lng = v_c1_lng,
          c2_lat = v_c2_lat, c2_lng = v_c2_lng,
          c3_lat = v_c3_lat, c3_lng = v_c3_lng,
          c4_lat = v_c4_lat, c4_lng = v_c4_lng,
          updated_at = now()
      where id = v_fence;
    end if;
  end if;

  update public.venues
  set geofence_id = v_fence
  where id = p_venue_id;

  if not found then
    raise exception 'Venue not found or not editable';
  end if;

  return v_fence;
end;
$$;

revoke execute on function public.set_venue_geofence(
  uuid, text, double precision, double precision, numeric, jsonb
) from public, anon;
grant execute on function public.set_venue_geofence(
  uuid, text, double precision, double precision, numeric, jsonb
) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Attendance: flag + location evidence (gap/accuracy only).
-- ---------------------------------------------------------------------
alter table public.attendance_records
  add column if not exists flag_reason text,
  add column if not exists location_distance_m numeric,
  add column if not exists location_accuracy_m numeric;

comment on column public.attendance_records.flag_reason is
  'Why a check-in was flagged (e.g. low_accuracy_overlap). NULL when not flagged.';
comment on column public.attendance_records.location_distance_m is
  'Gap in metres from the reported point to the fence (0 when inside or on the edge); only stored for flagged records.';
comment on column public.attendance_records.location_accuracy_m is
  'Reported GPS accuracy in metres at check-in, only stored for flagged records.';

grant select, update, delete on table public.attendance_records to authenticated;
grant select on table public.attendance_records to anon;

-- ---------------------------------------------------------------------
-- 6. Close the direct-insert bypass. All writes must go through the
--    SECURITY DEFINER check-in RPC; otherwise the fence is advisory.
-- ---------------------------------------------------------------------
drop policy if exists "Students insert own attendance" on public.attendance_records;
revoke insert on table public.attendance_records from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. check_in_attendance with the gap decision table.
--
--    point = reported location
--    gap   = distance to the fence in metres, 0 when inside/on the edge
--    a     = reported accuracy in metres
--    half_size = radius (circle) or sqrt(area)/2 (box)
--    good_limit = least(10, half_size)
--
--    invalid location / a > 100       -> no_location
--    venue has no fence               -> no_geofence
--    gap = 0                          -> allow normally
--    gap > a                          -> outside
--    0 < gap <= a and a <= good_limit -> outside_good_accuracy
--    0 < gap <= a and a > good_limit  -> allow, status flagged,
--                                        reason low_accuracy_overlap
--
--    The browser's reported accuracy is roughly a 68% confidence radius,
--    so an honest student will occasionally be blocked. A retry and a
--    lecturer-verified mark path are planned separately.
--
--    The old 5-argument signature is dropped below, so the unfenced
--    version cannot be called.
-- ---------------------------------------------------------------------
drop function if exists public.check_in_attendance(
  uuid, uuid, uuid, attendance_method, numeric
);

create or replace function public.check_in_attendance(
  p_session_id uuid,
  p_student_id uuid,
  p_device_id  uuid,
  p_method     attendance_method,
  p_confidence numeric,
  p_latitude   double precision,
  p_longitude  double precision,
  p_accuracy_m double precision
) returns attendance_records
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  GOOD_ACCURACY_M        constant double precision := 10;
  MAX_USABLE_ACCURACY_M  constant double precision := 100;

  v_session        class_sessions;
  v_venue          venues;
  v_fence          geofences;
  v_enrolled       boolean;
  v_record         attendance_records;
  v_status         attendance_status := 'present';
  v_point          geography;
  v_fence_geometry geometry;
  v_fence_polygon  geography;
  v_gap            double precision;
  v_half_size      double precision;
  v_good_limit     double precision;
begin
  -- a caller may only ever check in as themselves
  if p_student_id is distinct from auth.uid() then
    raise exception 'Cannot check in on behalf of another student';
  end if;

  -- device, when supplied, must belong to the caller
  if p_device_id is not null and not exists (
    select 1 from public.devices
    where id = p_device_id
      and user_id = auth.uid()
  ) then
    raise exception 'Device is not registered to the calling user';
  end if;

  -- Location validation: NULL, NaN, infinity, out-of-range or accuracy
  -- above the ceiling are all rejected. NOT BETWEEN also rejects NaN.
  if p_latitude is null
     or p_longitude is null
     or p_accuracy_m is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180
     or p_accuracy_m not between 0 and MAX_USABLE_ACCURACY_M then
    raise exception 'no_location';
  end if;

  select * into v_session
  from public.class_sessions
  where id = p_session_id;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;

  if v_session.status <> 'ongoing' then
    raise exception 'Session is not open for check-in';
  end if;

  select exists (
    select 1 from public.enrollments e
    where e.student_id = p_student_id
      and e.course_id = v_session.course_id
  ) into v_enrolled;

  if not v_enrolled then
    raise exception 'Student is not enrolled in this course';
  end if;

  select * into v_venue
  from public.venues
  where id = v_session.venue_id;

  if v_venue.id is null or v_venue.geofence_id is null then
    raise exception 'no_geofence';
  end if;

  select * into v_fence
  from public.geofences
  where id = v_venue.geofence_id;

  if v_fence.id is null then
    raise exception 'no_geofence';
  end if;

  v_point := st_setsrid(
    st_makepoint(p_longitude, p_latitude),
    4326
  )::geography;

  if v_fence.shape = 'circle' then
    v_gap := greatest(
      st_distance(
        v_point,
        st_setsrid(
          st_makepoint(v_fence.center_lng, v_fence.center_lat),
          4326
        )::geography
      ) - v_fence.radius_m::double precision,
      0
    );
    v_half_size := v_fence.radius_m::double precision;
  elsif v_fence.shape = 'box' then
    v_fence_geometry := st_setsrid(
      st_makepolygon(
        st_makeline(array[
          st_makepoint(v_fence.c1_lng, v_fence.c1_lat),
          st_makepoint(v_fence.c2_lng, v_fence.c2_lat),
          st_makepoint(v_fence.c3_lng, v_fence.c3_lat),
          st_makepoint(v_fence.c4_lng, v_fence.c4_lat),
          st_makepoint(v_fence.c1_lng, v_fence.c1_lat)
        ])
      ),
      4326
    );
    -- Normalise corner order so clockwise and anticlockwise rings give
    -- identical coverage/distance results.
    v_fence_geometry := st_forcepolygonccw(v_fence_geometry);
    v_fence_polygon := v_fence_geometry::geography;

    if st_covers(v_fence_polygon, v_point) then
      v_gap := 0;
    else
      v_gap := st_distance(v_point, v_fence_polygon);
    end if;

    v_half_size := sqrt(st_area(v_fence_polygon)) / 2;
  else
    raise exception 'no_geofence';
  end if;

  v_good_limit := least(GOOD_ACCURACY_M, v_half_size);

  if v_gap <= 0 then
    -- inside or on the edge: normal check-in
    null;
  elsif v_gap > p_accuracy_m then
    -- outside even allowing for the reported accuracy
    raise exception 'outside';
  elsif p_accuracy_m <= v_good_limit then
    -- just outside and the fix is trustworthy enough to block
    raise exception 'outside_good_accuracy';
  else
    -- just outside but the uncertainty overlaps the fence: allow,
    -- flagged for lecturer review.
    v_status := 'flagged';
  end if;

  -- mark late if checking in more than 15 minutes after the scheduled start
  if v_status <> 'flagged'
     and now() > v_session.scheduled_start + interval '15 minutes' then
    v_status := 'late';
  end if;

  insert into public.attendance_records (
    session_id,
    student_id,
    device_id,
    method,
    confidence_score,
    status,
    flag_reason,
    location_distance_m,
    location_accuracy_m
  ) values (
    p_session_id,
    p_student_id,
    p_device_id,
    p_method,
    p_confidence,
    v_status,
    case when v_status = 'flagged' then 'low_accuracy_overlap' else null end,
    case when v_status = 'flagged' then v_gap else null end,
    case when v_status = 'flagged' then p_accuracy_m else null end
  )
  on conflict (session_id, student_id) do nothing
  returning * into v_record;

  if v_record.id is null then
    raise exception 'Attendance already recorded for this session';
  end if;

  return v_record;
end;
$$;

-- Only signed-in users may call the check-in RPC. PUBLIC/anon are revoked.
revoke execute on function public.check_in_attendance(
  uuid, uuid, uuid, attendance_method, numeric,
  double precision, double precision, double precision
) from public, anon;
grant execute on function public.check_in_attendance(
  uuid, uuid, uuid, attendance_method, numeric,
  double precision, double precision, double precision
) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Roster RPC: surface flag_reason to the lecturer's session page.
--    Return type changed, so the function must be dropped/recreated.
-- ---------------------------------------------------------------------
drop function if exists public.get_session_attendance(uuid);

create or replace function public.get_session_attendance(
  p_session_id uuid
) returns table (
  record_id        uuid,
  session_id       uuid,
  student_id       uuid,
  student_name     text,
  student_number   text,
  method           attendance_method,
  status           attendance_status,
  check_in_time    timestamptz,
  confidence_score numeric,
  flag_reason      text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_session class_sessions;
begin
  select * into v_session
  from public.class_sessions
  where id = p_session_id;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;

  if v_session.lecturer_id is distinct from auth.uid() then
    raise exception 'Only the session lecturer can view its attendance';
  end if;

  return query
    select
      ar.id               as record_id,
      ar.session_id,
      ar.student_id,
      p.full_name         as student_name,
      p.student_number,
      ar.method,
      ar.status,
      ar.check_in_time,
      ar.confidence_score,
      ar.flag_reason
    from public.attendance_records ar
    join public.profiles p on p.id = ar.student_id
    where ar.session_id = p_session_id
    order by ar.check_in_time asc nulls last;
end;
$$;

revoke execute on function public.get_session_attendance(uuid)
  from public, anon;
grant execute on function public.get_session_attendance(uuid)
  to authenticated;
