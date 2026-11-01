-- =====================================================================
-- Class-BARS Migration 33: rollback
--
-- Restores the migration 31 check-in RPC and the migration 12 lecturer
-- roster, then removes the match columns, config table and helper RPCs.
-- Backup tables created by 33_face_match_confidence_backup.sql are left
-- in migration_backups for manual review/restore.
--
-- Hardening: runs inside a transaction, revokes execute on the new
-- functions before dropping them, and uses IF EXISTS so it is safe to
-- re-run.
-- =====================================================================

begin;

set lock_timeout = '5s';
set statement_timeout = '30s';

-- Revoke execute on the new 9-arg face RPC and helpers before dropping.
do $$
begin
  if to_regprocedure('public.check_in_attendance(uuid,uuid,uuid,attendance_method,numeric,double precision,double precision,double precision,double precision)') is not null then
    revoke execute on function public.check_in_attendance(
      uuid, uuid, uuid, attendance_method, numeric,
      double precision, double precision, double precision, double precision
    ) from public, anon, authenticated;
  end if;
end
$$;

do $$
begin
  if to_regprocedure('public._check_in_attendance(uuid,uuid,uuid,attendance_method,numeric,double precision,double precision,double precision,double precision)') is not null then
    revoke execute on function public._check_in_attendance(
      uuid, uuid, uuid, attendance_method, numeric,
      double precision, double precision, double precision, double precision
    ) from public, anon, authenticated;
  end if;
end
$$;

do $$
begin
  if to_regprocedure('public.face_match_score(double precision)') is not null then
    revoke execute on function public.face_match_score(double precision)
    from public, anon, authenticated;
  end if;
end
$$;

do $$
begin
  if to_regprocedure('public.set_face_match_config(text,numeric,numeric,numeric,numeric,text,timestamptz)') is not null then
    revoke execute on function public.set_face_match_config(
      text, numeric, numeric, numeric, numeric, text, timestamptz
    ) from public, anon, authenticated;
  end if;
end
$$;

drop function if exists public.check_in_attendance(
  uuid, uuid, uuid, attendance_method, numeric,
  double precision, double precision, double precision, double precision
);

-- Restore the migration 31 8-argument check-in RPC (OTP/manual only;
-- rejects method=face so an unscored face check-in cannot bypass scoring).
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
  MAX_USABLE_ACCURACY_M  constant double precision := 200;

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
  if p_student_id is distinct from auth.uid() then
    raise exception 'Cannot check in on behalf of another student';
  end if;

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
    v_fence_geometry := st_forcepolygonccw(v_fence_geometry);
    v_fence_polygon := v_fence_geometry::geography;

    if st_covers(v_fence_polygon, v_point) then
      v_gap := 0;
    else
      v_gap := st_distance(v_point, v_fence_polygon);
    end if;

    v_half_size := sqrt(st_area(v_fence_polygon)) / 2.0;
  else
    raise exception 'no_geofence';
  end if;

  v_good_limit := least(GOOD_ACCURACY_M, v_half_size);

  if v_gap > p_accuracy_m then
    raise exception 'outside';
  elsif v_gap > 0 and p_accuracy_m <= v_good_limit then
    raise exception 'outside_good_accuracy';
  elsif v_gap > 0 and p_accuracy_m > v_good_limit then
    v_status := 'flagged';
  end if;

  insert into public.attendance_records (
    session_id,
    student_id,
    method,
    confidence_score,
    status,
    flag_reason,
    location_distance_m,
    location_accuracy_m,
    check_in_time
  ) values (
    p_session_id,
    p_student_id,
    p_method,
    p_confidence,
    v_status,
    case when v_status = 'flagged' then 'low_accuracy_overlap' else null end,
    case when v_status = 'flagged' then v_gap else null end,
    case when v_status = 'flagged' then p_accuracy_m else null end,
    now()
  )
  returning * into v_record;

  return v_record;
exception
  when unique_violation then
    raise exception 'already recorded';
end;
$$;

revoke execute on function public.check_in_attendance(
  uuid, uuid, uuid, attendance_method, numeric,
  double precision, double precision, double precision
) from public, anon;
grant execute on function public.check_in_attendance(
  uuid, uuid, uuid, attendance_method, numeric,
  double precision, double precision, double precision
) to authenticated;

drop function if exists public._check_in_attendance(
  uuid, uuid, uuid, attendance_method, numeric,
  double precision, double precision, double precision, double precision
);

drop function if exists public.face_match_score(double precision);

drop function if exists public.set_face_match_config(
  text, numeric, numeric, numeric, numeric, text, timestamptz
);

drop function if exists public.get_session_attendance(uuid);

create function public.get_session_attendance(
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

alter table public.attendance_records
  drop constraint if exists attendance_records_match_band_check,
  drop constraint if exists attendance_records_match_score_check,
  drop constraint if exists attendance_records_match_distance_check;

alter table public.attendance_records
  drop column if exists match_distance,
  drop column if exists match_score,
  drop column if exists match_band,
  drop column if exists match_config_version;

drop table if exists public.face_match_config;

commit;
