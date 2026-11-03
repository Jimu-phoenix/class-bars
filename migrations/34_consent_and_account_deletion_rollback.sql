-- =====================================================================
-- Class-BARS Migration 34: rollback
--
-- Drops the consent trigger/function, record_consent, delete_my_account,
-- restores upsert_face_embedding and _check_in_attendance without the
-- consent check, and restores attendance_records.student_id NULLability
-- handling.
--
-- NOTE: consent columns on public.profiles are NOT dropped here. Account
-- deletion is irreversible and consent records must be preserved for
-- audit purposes. Drop them manually only if you are certain no data
-- needs to be retained.
-- =====================================================================

begin;

set lock_timeout = '5s';
set statement_timeout = '30s';

-- Revoke execute on new functions before dropping.
do $$
begin
  if to_regprocedure('public.record_consent(text)') is not null then
    revoke execute on function public.record_consent(text) from public, anon, authenticated;
  end if;
end
$$;

do $$
begin
  if to_regprocedure('public.delete_my_account()') is not null then
    revoke execute on function public.delete_my_account() from public, anon, authenticated;
  end if;
end
$$;

drop function if exists public.record_consent(text);
drop function if exists public.delete_my_account();

-- Drop consent trigger and function.
drop trigger if exists trg_protect_profiles_consent on public.profiles;
drop function if exists public.protect_profiles_consent();

-- NOTE: consent columns are intentionally NOT dropped.
-- alter table public.profiles
--   drop column if exists consent_given_at,
--   drop column if exists consent_version;

-- Restore upsert_face_embedding without the consent check.
create or replace function public.upsert_face_embedding(
  p_embedding jsonb,
  p_model_version text
) returns face_embeddings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row face_embeddings;
begin
  if p_embedding is null or jsonb_typeof(p_embedding) <> 'array' then
    raise exception 'embedding must be a JSON array';
  end if;

  delete from face_embeddings
  where user_id = auth.uid()
    and id not in (
      select id from face_embeddings
      where user_id = auth.uid()
      order by is_active desc, updated_at desc, created_at desc
      limit 1
    );

  update face_embeddings
  set embedding_json = p_embedding,
      model_version  = coalesce(nullif(trim(p_model_version), ''), model_version),
      is_active      = true,
      updated_at     = now()
  where user_id = auth.uid()
  returning * into v_row;

  if v_row.id is not null then
    return v_row;
  end if;

  insert into face_embeddings (user_id, embedding_json, model_version, is_active)
  values (
    auth.uid(),
    p_embedding,
    coalesce(nullif(trim(p_model_version), ''), 'unknown'),
    true
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- Restore _check_in_attendance without the consent check.
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
begin
  if p_method is null then
    raise exception 'invalid_method';
  end if;

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

commit;
