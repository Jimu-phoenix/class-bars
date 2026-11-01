-- =====================================================================
-- Class-BARS Migration 33: server-computed face match confidence
--
-- Adds a calibrated match score/band to face check-ins. The client sends
-- only the median descriptor distance; the database derives the score and
-- band from face_match_config. Lecturers receive a stored match_score and
-- render a rounded percentage. The raw distance is never shown.
--
-- Run order:
--   1. 33_face_match_confidence_backup.sql
--   2. 33_face_match_confidence.sql (this file)
--   3. 33_face_match_confidence_rollback.sql only if needed
--
-- Apply to a Supabase branch/staging project first.
-- =====================================================================

set lock_timeout = '5s';
set statement_timeout = '30s';
set search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- 1. Calibration config. One row only.
-- config_revision increments on every successful update so config changes
-- are traceable alongside the audit_logs entry written by set_face_match_config.
-- ---------------------------------------------------------------------
create table if not exists public.face_match_config (
  singleton        boolean primary key default true check (singleton),
  config_revision  bigint not null default 1,
  model_version    text not null check (btrim(model_version) <> ''),
  a                numeric not null,
  b                numeric not null,
  accept_score     numeric not null,
  review_score     numeric not null,
  source_note      text not null check (btrim(source_note) <> ''),
  effective_from   timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint face_match_config_finite_check check (
    a::text not in ('NaN', 'Infinity', '-Infinity')
    and b::text not in ('NaN', 'Infinity', '-Infinity')
    and accept_score::text not in ('NaN', 'Infinity', '-Infinity')
    and review_score::text not in ('NaN', 'Infinity', '-Infinity')
  ),
  constraint face_match_config_scores_check check (
    review_score > 0
    and review_score < accept_score
    and accept_score < 1
  )
);

comment on table public.face_match_config is
  'Single-row calibration for the server-side face match score.';
comment on column public.face_match_config.config_revision is
  'Monotonically increasing revision; incremented on every config update.';

insert into public.face_match_config (
  singleton,
  config_revision,
  model_version,
  a,
  b,
  accept_score,
  review_score,
  source_note
) values (
  true,
  1,
  'face-api-recognition-full68-v1',
  19.8713,
  -10.7966,
  0.80,
  0.60,
  'Provisional pilot calibration; replace after larger validation.'
)
on conflict (singleton) do nothing;

alter table public.face_match_config enable row level security;
alter table public.face_match_config force row level security;

do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'face_match_config'
  loop
    execute format('drop policy if exists %I on public.face_match_config', pol.policyname);
  end loop;
end
$$;

create policy "Admin users read face match config"
  on public.face_match_config for select
  to authenticated
  using (public.is_admin_user());

revoke all on table public.face_match_config from public, anon;
revoke insert, update, delete on table public.face_match_config from authenticated;
grant select on table public.face_match_config to authenticated;

-- ---------------------------------------------------------------------
-- 2. Attendance match columns. Nullable so existing rows are untouched.
-- ---------------------------------------------------------------------
alter table public.attendance_records
  add column if not exists match_distance double precision,
  add column if not exists match_score numeric,
  add column if not exists match_band text,
  add column if not exists match_config_version text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'attendance_records_match_band_check'
      and conrelid = 'public.attendance_records'::regclass
  ) then
    alter table public.attendance_records
      add constraint attendance_records_match_band_check
      check (match_band is null or match_band in ('accept', 'review'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'attendance_records_match_score_check'
      and conrelid = 'public.attendance_records'::regclass
  ) then
    alter table public.attendance_records
      add constraint attendance_records_match_score_check
      check (match_score is null or (match_score >= 0 and match_score <= 1));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'attendance_records_match_distance_check'
      and conrelid = 'public.attendance_records'::regclass
  ) then
    alter table public.attendance_records
      add constraint attendance_records_match_distance_check
      check (match_distance is null or match_distance >= 0);
  end if;
end
$$;

comment on column public.attendance_records.match_distance is
  'Client-supplied median face descriptor distance. Not tamper-proof.';
comment on column public.attendance_records.match_score is
  'Server-computed calibrated face match score (0-1).';
comment on column public.attendance_records.match_band is
  'accept or review for recorded face check-ins; NULL for OTP/manual.';
comment on column public.attendance_records.match_config_version is
  'face_match_config.model_version used for match_score.';

-- ---------------------------------------------------------------------
-- 3. Score function. Reads the current config; stable, not immutable.
-- ---------------------------------------------------------------------
create or replace function public.face_match_score(
  p_distance double precision
) returns table (
  score          numeric,
  band           text,
  config_version text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  MAX_DISTANCE constant double precision := 10;
  v_config public.face_match_config;
  v_score numeric;
begin
  if p_distance is null
     or p_distance::text in ('NaN', 'Infinity', '-Infinity')
     or p_distance < 0
     or p_distance > MAX_DISTANCE then
    raise exception 'invalid_face_distance';
  end if;

  select * into v_config
  from public.face_match_config
  where singleton;

  if v_config.singleton is null then
    raise exception 'face_match_config_missing';
  end if;

  v_score := greatest(
    0,
    least(
      1,
      (
        1.0::double precision / (
          1.0::double precision + exp(
            v_config.a::double precision * p_distance
            + v_config.b::double precision
          )
        )
      )::numeric
    )
  );

  return query
    select
      v_score,
      case
        when v_score >= v_config.accept_score then 'accept'
        when v_score >= v_config.review_score then 'review'
        else 'retry'
      end,
      v_config.model_version;
end;
$$;

comment on function public.face_match_score(double precision) is
  'Calibrated face match score/band from a descriptor distance.';

revoke execute on function public.face_match_score(double precision)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Admin-only config update with audit trail.
-- ---------------------------------------------------------------------
create or replace function public.set_face_match_config(
  p_model_version  text,
  p_a              numeric,
  p_b              numeric,
  p_accept_score   numeric,
  p_review_score   numeric,
  p_source_note    text,
  p_effective_from timestamptz default now()
) returns public.face_match_config
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old public.face_match_config;
  v_new public.face_match_config;
begin
  if not public.is_admin_user() then
    raise exception 'Only admins can update face match config';
  end if;

  if p_model_version is null or btrim(p_model_version) = ''
     or p_source_note is null or btrim(p_source_note) = '' then
    raise exception 'invalid_face_match_config';
  end if;

  if p_a is null or p_b is null
     or p_accept_score is null or p_review_score is null
     or p_a::text in ('NaN', 'Infinity', '-Infinity')
     or p_b::text in ('NaN', 'Infinity', '-Infinity')
     or p_accept_score::text in ('NaN', 'Infinity', '-Infinity')
     or p_review_score::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'invalid_face_match_config';
  end if;

  if not (
    p_review_score > 0
    and p_review_score < p_accept_score
    and p_accept_score < 1
  ) then
    raise exception 'invalid_face_match_config';
  end if;

  select * into v_old
  from public.face_match_config
  where singleton
  for update;

  insert into public.face_match_config (
    singleton,
    config_revision,
    model_version,
    a,
    b,
    accept_score,
    review_score,
    source_note,
    effective_from,
    updated_at
  ) values (
    true,
    v_old.config_revision + 1,
    p_model_version,
    p_a,
    p_b,
    p_accept_score,
    p_review_score,
    p_source_note,
    coalesce(p_effective_from, now()),
    now()
  )
  on conflict (singleton) do update
  set model_version = excluded.model_version,
      a = excluded.a,
      b = excluded.b,
      accept_score = excluded.accept_score,
      review_score = excluded.review_score,
      source_note = excluded.source_note,
      config_revision = excluded.config_revision,
      effective_from = excluded.effective_from,
      updated_at = excluded.updated_at
  returning * into v_new;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    auth.uid(),
    'face_match_config.update',
    'face_match_config',
    null,
    jsonb_build_object(
      'old', to_jsonb(v_old),
      'new', to_jsonb(v_new),
      'revision', v_new.config_revision
    )
  );

  return v_new;
end;
$$;

revoke execute on function public.set_face_match_config(
  text, numeric, numeric, numeric, numeric, text, timestamptz
) from public, anon;
grant execute on function public.set_face_match_config(
  text, numeric, numeric, numeric, numeric, text, timestamptz
) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Internal check-in implementation. Public RPCs below delegate here.
-- ---------------------------------------------------------------------
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

  -- a caller may only ever check in as themselves
  if p_student_id is distinct from auth.uid() then
    raise exception 'Cannot check in on behalf of another student';
  end if;

  -- Location validation: NULL, NaN, infinity, out-of-range or accuracy
  -- above the ceiling are all rejected. Exactly 200 m is still usable.
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
    -- Normalise corner order so clockwise and anticlockwise rings give
    -- identical coverage/distance results.
    v_fence_geometry := st_forcepolygonccw(v_fence_geometry);
    v_fence_polygon := v_fence_geometry::geography;

    if st_covers(v_fence_polygon, v_point) then
      v_gap := 0;
    else
      v_gap := st_distance(v_point, v_fence_polygon);
    end if;

    -- Geography ST_Area returns square metres (geometry returns degrees²).
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

revoke execute on function public._check_in_attendance(
  uuid, uuid, uuid, attendance_method, numeric,
  double precision, double precision, double precision, double precision
) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Face RPC: 9 arguments, structured result including retry.
-- ---------------------------------------------------------------------
create or replace function public.check_in_attendance(
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
language sql
security definer
set search_path = public, pg_temp
as $$
  select public._check_in_attendance(
    p_session_id,
    p_student_id,
    p_device_id,
    p_method,
    p_confidence,
    p_latitude,
    p_longitude,
    p_accuracy_m,
    p_match_distance
  );
$$;

revoke execute on function public.check_in_attendance(
  uuid, uuid, uuid, attendance_method, numeric,
  double precision, double precision, double precision, double precision
) from public, anon;
grant execute on function public.check_in_attendance(
  uuid, uuid, uuid, attendance_method, numeric,
  double precision, double precision, double precision, double precision
) to authenticated;

-- ---------------------------------------------------------------------
-- 7. OTP/manual compatibility RPC: 8 arguments, attendance_records.
--    Rejects method=face so an unscored face check-in cannot bypass the
--    new scoring path.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 8. Lecturer roster includes the stored server score.
-- ---------------------------------------------------------------------
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
  match_score      numeric,
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
      ar.match_score,
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
