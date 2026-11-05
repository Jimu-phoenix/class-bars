-- Class-BARS Migration 35: lecturer manual "mark present" on live session

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, pg_temp;

create or replace function public.get_session_enrolled_students(
  p_session_id uuid
) returns table (
  student_id        uuid,
  full_name         text,
  registration_number text,
  checked_in        boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_session class_sessions;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_session
  from public.class_sessions
  where id = p_session_id;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;

  if v_session.lecturer_id is distinct from auth.uid() then
    raise exception 'Only the session lecturer can view its students';
  end if;

  return query
  select
    p.id               as student_id,
    p.full_name        as full_name,
    p.student_number   as registration_number,
    exists (
      select 1
      from public.attendance_records ar
      where ar.session_id = p_session_id
        and ar.student_id = p.id
    )                  as checked_in
  from public.enrollments e
  join public.profiles p on p.id = e.student_id
  where e.course_id = v_session.course_id
  order by p.student_number asc nulls last, p.full_name asc nulls last;
end;
$$;

revoke all on function public.get_session_enrolled_students(uuid) from public, anon;
grant execute on function public.get_session_enrolled_students(uuid) to authenticated;

create or replace function public.lecturer_mark_present(
  p_session_id uuid,
  p_student_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session  class_sessions;
  v_enrolled boolean;
  v_record   attendance_records;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_lecturer_user() then
    raise exception 'Only lecturers can mark attendance';
  end if;

  select * into v_session
  from public.class_sessions
  where id = p_session_id;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;

  if v_session.lecturer_id is distinct from auth.uid() then
    raise exception 'Only the session lecturer can mark attendance';
  end if;

  if v_session.status is distinct from 'ongoing' then
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

  insert into public.attendance_records (
    session_id,
    student_id,
    method,
    confidence_score,
    status,
    flag_reason,
    location_distance_m,
    location_accuracy_m,
    match_distance,
    match_score,
    match_band,
    match_config_version,
    check_in_time
  ) values (
    p_session_id,
    p_student_id,
    'manual',
    null,
    'present',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    now()
  )
  returning * into v_record;

  perform public.write_audit_log(
    'attendance.manual_marked',
    'attendance_records',
    v_record.id,
    jsonb_build_object('session_id', p_session_id),
    auth.uid()
  );

  return jsonb_build_object(
    'record_id', v_record.id,
    'session_id', v_record.session_id,
    'student_id', v_record.student_id,
    'status', v_record.status,
    'method', v_record.method
  );
exception
  when unique_violation then
    raise exception 'already recorded';
end;
$$;

revoke all on function public.lecturer_mark_present(uuid, uuid) from public, anon;
grant execute on function public.lecturer_mark_present(uuid, uuid) to authenticated;

create or replace function public._check_in_attendance(
  p_session_id     uuid,
  p_student_id     uuid,
  p_device_id      uuid,
  p_method         attendance_method,
  p_confidence     numeric,
  p_latitude       double precision,
  p_longitude      double precision,
  p_accuracy_m     double precision,
  p_match_distance double precision
) returns jsonb
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
  v_location_flagged boolean := false;
  v_flag_reasons   text[] := array[]::text[];
  v_match_score    numeric;
  v_match_band     text;
  v_match_version  text;
  v_consent        timestamptz;
begin
  if p_method is null then
    raise exception 'invalid_method';
  end if;

  if p_method = 'manual' then
    raise exception 'manual_not_allowed';
  end if;

  if p_student_id is distinct from auth.uid() then
    raise exception 'Cannot check in on behalf of another student';
  end if;

  if p_method = 'face' then
    select consent_given_at into v_consent
    from public.profiles
    where id = auth.uid();

    if v_consent is null then
      raise exception 'consent_required';
    end if;
  end if;

  if p_latitude is null
     or p_longitude is null
     or p_accuracy_m is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180
     or p_accuracy_m not between 0 and MAX_USABLE_ACCURACY_M then
    raise exception 'no_location';
  end if;

  if p_method = 'face' then
    if p_match_distance is null then
      raise exception 'face_distance_required';
    end if;
  elsif p_match_distance is not null then
    raise exception 'face_distance_not_allowed';
  end if;

  select * into v_session
  from public.class_sessions
  where id = p_session_id;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;

  if v_session.status is distinct from 'ongoing' then
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
    v_location_flagged := true;
    v_flag_reasons := array_append(v_flag_reasons, 'low_accuracy_overlap');
  end if;

  if p_method = 'face' then
    select score, band, config_version
    into v_match_score, v_match_band, v_match_version
    from public.face_match_score(p_match_distance);

    if v_match_band = 'retry' then
      return jsonb_build_object(
        'outcome', 'retry',
        'band', v_match_band,
        'config_version', v_match_version
      );
    end if;

    if v_match_band = 'review' then
      v_status := 'flagged';
      v_flag_reasons := array_append(v_flag_reasons, 'face_review');
    end if;
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
    match_distance,
    match_score,
    match_band,
    match_config_version,
    check_in_time
  ) values (
    p_session_id,
    p_student_id,
    p_method,
    p_confidence,
    v_status,
    case
      when cardinality(v_flag_reasons) > 0
        then array_to_string(v_flag_reasons, ',')
      else null
    end,
    case when v_location_flagged then v_gap else null end,
    case when v_location_flagged then p_accuracy_m else null end,
    case when p_method = 'face' then p_match_distance else null end,
    v_match_score,
    v_match_band,
    v_match_version,
    now()
  )
  returning * into v_record;

  return jsonb_build_object(
    'outcome', case when v_status = 'flagged' then 'review' else 'accept' end,
    'record', jsonb_build_object(
      'id', v_record.id,
      'session_id', v_record.session_id,
      'student_id', v_record.student_id,
      'method', v_record.method,
      'status', v_record.status,
      'check_in_time', v_record.check_in_time,
      'confidence_score', v_record.confidence_score,
      'flag_reason', v_record.flag_reason,
      'location_distance_m', v_record.location_distance_m,
      'location_accuracy_m', v_record.location_accuracy_m
    ),
    'band', v_match_band,
    'config_version', v_match_version
  );
exception
  when unique_violation then
    raise exception 'already recorded';
end;
$$;

revoke all on function public._check_in_attendance(
  uuid, uuid, uuid, attendance_method, numeric,
  double precision, double precision, double precision, double precision
) from public, anon, authenticated;

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
  v_result jsonb;
begin
  if p_method = 'manual' then
    raise exception 'manual_not_allowed';
  end if;

  if p_method = 'face' then
    raise exception 'face_distance_required';
  end if;

  v_result := public._check_in_attendance(
    p_session_id,
    p_student_id,
    p_device_id,
    p_method,
    p_confidence,
    p_latitude,
    p_longitude,
    p_accuracy_m,
    null
  );

  if v_result ->> 'outcome' = 'retry' then
    raise exception 'face_retry';
  end if;

  return jsonb_populate_record(
    null::public.attendance_records,
    v_result -> 'record'
  );
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

commit;
