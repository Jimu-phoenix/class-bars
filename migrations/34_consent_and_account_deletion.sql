-- Class-BARS Migration 34: recorded consent + self-service account deletion (students only)

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, pg_temp;

alter table public.profiles
  add column if not exists consent_given_at timestamptz,
  add column if not exists consent_version text;

comment on column public.profiles.consent_given_at is
  'When the student last recorded consent. NULL means consent has not been recorded.';
comment on column public.profiles.consent_version is
  'Consent version string (YYYY-MM-vN). NULL means consent has not been recorded.';

create or replace function public.protect_profiles_consent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.consent_given_at is not null
         or new.consent_version is not null then
        raise exception 'consent columns cannot be set directly';
      end if;
    else
      if new.consent_given_at is distinct from old.consent_given_at
         or new.consent_version is distinct from old.consent_version then
        raise exception 'consent columns cannot be set directly';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profiles_consent on public.profiles;
create trigger trg_protect_profiles_consent
  before insert or update on public.profiles
  for each row
  execute function public.protect_profiles_consent();

create or replace function public.record_consent(p_version text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role             public.profiles.role%type;
  v_existing         timestamptz;
  v_existing_version text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role
  from public.profiles
  where id = auth.uid();

  if v_role is null then
    raise exception 'Profile not found';
  end if;

  if v_role <> 'student' then
    raise exception 'Only students can record consent';
  end if;

  if p_version is null
     or p_version !~ '^[0-9]{4}-[0-9]{2}-v[0-9]+$'
     or char_length(p_version) > 20 then
    raise exception 'invalid_consent_version';
  end if;

  select consent_given_at, consent_version
  into v_existing, v_existing_version
  from public.profiles
  where id = auth.uid();

  if v_existing is not null and v_existing_version = p_version then
    return;
  end if;

  update public.profiles
  set consent_given_at = now(),
      consent_version = p_version
  where id = auth.uid();

  perform public.write_audit_log(
    'consent.recorded',
    'profiles',
    auth.uid(),
    jsonb_build_object('version', p_version),
    auth.uid()
  );
end;
$$;

revoke all on function public.record_consent(text) from public, anon;
grant execute on function public.record_consent(text) to authenticated;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_role public.profiles.role%type;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role
  from public.profiles
  where id = v_uid;

  if v_role is null then
    raise exception 'Profile not found';
  end if;

  if v_role <> 'student' then
    raise exception 'Only students can delete their account';
  end if;

  delete from public.face_embeddings where user_id = v_uid;
  delete from public.enrollments where student_id = v_uid;
  delete from public.otp_codes where user_id = v_uid;

  update public.attendance_records
  set student_id = null,
      confidence_score = null,
      flag_reason = null,
      location_distance_m = null,
      location_accuracy_m = null,
      match_distance = null,
      match_score = null,
      match_band = null,
      match_config_version = null
  where student_id = v_uid;

  update public.audit_logs
  set ip_address = null,
      user_agent = null,
      user_id = null
  where user_id = v_uid;

  update public.audit_logs
  set entity_id = null
  where entity_id = v_uid;

  update public.audit_logs
  set metadata = '{}'::jsonb
  where metadata::text like '%' || v_uid::text || '%';

  perform public.write_audit_log(
    'account.deleted',
    'profiles',
    null,
    '{}'::jsonb,
    null
  );

  delete from public.profiles
  where id = v_uid;

  delete from auth.users
  where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

alter table public.attendance_records
  alter column student_id drop not null;

create or replace function public.upsert_face_embedding(
  p_embedding jsonb,
  p_model_version text
) returns face_embeddings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row       face_embeddings;
  v_consent   timestamptz;
begin
  if p_embedding is null or jsonb_typeof(p_embedding) <> 'array' then
    raise exception 'embedding must be a JSON array';
  end if;

  select consent_given_at into v_consent
  from public.profiles
  where id = auth.uid();

  if v_consent is null then
    raise exception 'consent_required';
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

commit;
