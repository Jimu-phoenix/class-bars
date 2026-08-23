-- =====================================================================
-- Class-BARS: Biometric Attendance Recording System
-- Phase 1 schema -- NO geolocation/geofencing
-- Geofencing (PostGIS, venues.geofence, location checks) is added later
-- as a separate migration once core attendance recording is verified.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- pgcrypto only -- no postgis needed for this phase
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------
create type user_role as enum ('student', 'lecturer', 'admin');
create type attendance_method as enum ('face', 'otp', 'manual');
create type attendance_status as enum ('present', 'late', 'absent', 'flagged');
create type session_status as enum ('scheduled', 'ongoing', 'completed', 'cancelled');
create type otp_purpose as enum ('attendance_fallback', 'login_verification');

-- ---------------------------------------------------------------------
-- profiles (extends auth.users)
-- ---------------------------------------------------------------------
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  full_name      text not null,
  role           user_role not null default 'student',
  student_number text unique,
  staff_number   text unique,
  phone_number   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_profiles_role on profiles(role);

-- ---------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------
create table courses (
  id          uuid primary key default gen_random_uuid(),
  course_code text not null unique,
  course_name text not null,
  department  text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- venues (name/location only -- geofence polygon added in a later migration)
-- ---------------------------------------------------------------------
create table venues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  building   text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- class_sessions (a scheduled instance of a course)
-- ---------------------------------------------------------------------
create table class_sessions (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid not null references courses(id) on delete cascade,
  lecturer_id     uuid not null references profiles(id),
  venue_id        uuid not null references venues(id),
  scheduled_start timestamptz not null,
  scheduled_end   timestamptz not null,
  actual_start    timestamptz,
  actual_end      timestamptz,
  status          session_status not null default 'scheduled',
  created_at      timestamptz not null default now(),
  check (scheduled_end > scheduled_start)
);
create index idx_sessions_course on class_sessions(course_id);
create index idx_sessions_lecturer on class_sessions(lecturer_id);
create index idx_sessions_venue on class_sessions(venue_id);
create index idx_sessions_start on class_sessions(scheduled_start);

-- ---------------------------------------------------------------------
-- enrollments
-- ---------------------------------------------------------------------
create table enrollments (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references profiles(id) on delete cascade,
  course_id     uuid not null references courses(id) on delete cascade,
  academic_year text not null,
  semester      text not null,
  created_at    timestamptz not null default now(),
  unique (student_id, course_id, academic_year, semester)
);
create index idx_enrollments_student on enrollments(student_id);
create index idx_enrollments_course on enrollments(course_id);

-- ---------------------------------------------------------------------
-- face_embeddings (encrypted vectors only -- never raw images)
-- ---------------------------------------------------------------------
create table face_embeddings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references profiles(id) on delete cascade,
  embedding_encrypted text not null,   -- CryptoJS-encrypted descriptor array
  model_version       text not null,   -- e.g. 'face-api-tinyFaceDetector-v1'
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- Only one active embedding per student at a time
create unique index idx_face_embeddings_active_user
  on face_embeddings(user_id) where is_active;
create index idx_face_embeddings_user on face_embeddings(user_id);

-- ---------------------------------------------------------------------
-- devices (fraud detection: one device checking in many students)
-- ---------------------------------------------------------------------
create table devices (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references profiles(id) on delete cascade,
  device_fingerprint text not null,
  device_name        text,
  is_trusted         boolean not null default false,
  last_seen_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  unique (user_id, device_fingerprint)
);
create index idx_devices_user on devices(user_id);
create index idx_devices_fingerprint on devices(device_fingerprint);

-- ---------------------------------------------------------------------
-- attendance_records (no geolocation columns in this phase)
-- ---------------------------------------------------------------------
create table attendance_records (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references class_sessions(id) on delete cascade,
  student_id       uuid not null references profiles(id) on delete cascade,
  device_id        uuid references devices(id),
  method           attendance_method not null,
  status           attendance_status not null default 'present',
  check_in_time    timestamptz not null default now(),
  confidence_score numeric(5,4),          -- face match score, 0-1
  created_at       timestamptz not null default now(),
  unique (session_id, student_id)         -- one check-in per student per session
);
create index idx_attendance_session on attendance_records(session_id);
create index idx_attendance_student on attendance_records(student_id);
create index idx_attendance_checkin_time on attendance_records(check_in_time);

-- ---------------------------------------------------------------------
-- otp_codes (fallback check-in)
-- ---------------------------------------------------------------------
create table otp_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  session_id uuid references class_sessions(id) on delete cascade,
  code_hash  text not null,               -- never store plaintext OTP
  purpose    otp_purpose not null default 'attendance_fallback',
  attempts   int not null default 0,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index idx_otp_user on otp_codes(user_id);
create index idx_otp_session on otp_codes(session_id);
create index idx_otp_expiry on otp_codes(expires_at);

-- ---------------------------------------------------------------------
-- audit_logs (dispute resolution + academic integrity trail)
-- ---------------------------------------------------------------------
create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  metadata    jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index idx_audit_user on audit_logs(user_id);
create index idx_audit_entity on audit_logs(entity_type, entity_id);
create index idx_audit_created on audit_logs(created_at);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table profiles enable row level security;
alter table courses enable row level security;
alter table venues enable row level security;
alter table class_sessions enable row level security;
alter table enrollments enable row level security;
alter table face_embeddings enable row level security;
alter table devices enable row level security;
alter table attendance_records enable row level security;
alter table otp_codes enable row level security;
alter table audit_logs enable row level security;

-- --- profiles ---
create policy "Users view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Users update own profile"
  on profiles for update
  using (auth.uid() = id);

-- --- face_embeddings ---
create policy "Students view own embedding"
  on face_embeddings for select
  using (auth.uid() = user_id);

create policy "Students insert own embedding"
  on face_embeddings for insert
  with check (auth.uid() = user_id);

-- --- attendance_records ---
create policy "Students view own attendance"
  on attendance_records for select
  using (auth.uid() = student_id);

create policy "Students insert own attendance"
  on attendance_records for insert
  with check (auth.uid() = student_id);

create policy "Lecturers view their session attendance"
  on attendance_records for select
  using (
    exists (
      select 1 from class_sessions cs
      where cs.id = attendance_records.session_id
      and cs.lecturer_id = auth.uid()
    )
  );

-- --- class_sessions ---
create policy "Enrolled students view their sessions"
  on class_sessions for select
  using (
    exists (
      select 1 from enrollments e
      where e.course_id = class_sessions.course_id
      and e.student_id = auth.uid()
    )
    or lecturer_id = auth.uid()
  );

-- --- devices ---
create policy "Users manage own devices"
  on devices for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- --- otp_codes ---
create policy "Users view own otp codes"
  on otp_codes for select
  using (auth.uid() = user_id);

-- NOTE: admin role should bypass RLS via a service-role key on trusted
-- server-side calls only (Edge Functions), never exposed client-side.
-- Extend the policies above with an admin clause once the admin dashboard exists:
--   or exists (select 1 from profiles where id = auth.uid() and role = 'admin')

-- =====================================================================
-- RPC: atomic check-in, no geolocation
-- Still validates the things that matter without location:
-- session exists and is ongoing, student is enrolled, no duplicate check-in.
-- =====================================================================
create or replace function check_in_attendance(
  p_session_id uuid,
  p_student_id uuid,
  p_device_id  uuid,
  p_method     attendance_method,
  p_confidence numeric default null
) returns attendance_records
language plpgsql
security definer
as $$
declare
  v_session  class_sessions;
  v_enrolled boolean;
  v_record   attendance_records;
  v_status   attendance_status := 'present';
begin
  select * into v_session from class_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'Session not found';
  end if;

  if v_session.status <> 'ongoing' then
    raise exception 'Session is not open for check-in';
  end if;

  select exists (
    select 1 from enrollments e
    where e.student_id = p_student_id and e.course_id = v_session.course_id
  ) into v_enrolled;

  if not v_enrolled then
    raise exception 'Student is not enrolled in this course';
  end if;

  -- mark late if checking in more than 15 minutes after the scheduled start
  if now() > v_session.scheduled_start + interval '15 minutes' then
    v_status := 'late';
  end if;

  insert into attendance_records (
    session_id, student_id, device_id, method, confidence_score, status
  ) values (
    p_session_id, p_student_id, p_device_id, p_method, p_confidence, v_status
  )
  on conflict (session_id, student_id) do nothing
  returning * into v_record;

  if v_record.id is null then
    raise exception 'Attendance already recorded for this session';
  end if;

  return v_record;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: start a class session (lecturer only)
-- ---------------------------------------------------------------------
create or replace function start_session(
  p_session_id uuid
) returns class_sessions
language plpgsql
security definer
as $$
declare
  v_session class_sessions;
begin
  select * into v_session from class_sessions where id = p_session_id;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;

  if v_session.lecturer_id <> auth.uid() then
    raise exception 'Only the assigned lecturer can start this session';
  end if;

  if v_session.status <> 'scheduled' then
    raise exception 'Session already started or ended';
  end if;

  update class_sessions
  set status = 'ongoing', actual_start = now()
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: end a class session (lecturer only)
-- ---------------------------------------------------------------------
create or replace function end_session(
  p_session_id uuid
) returns class_sessions
language plpgsql
security definer
as $$
declare
  v_session class_sessions;
begin
  select * into v_session from class_sessions where id = p_session_id;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;

  if v_session.lecturer_id <> auth.uid() then
    raise exception 'Only the assigned lecturer can end this session';
  end if;

  if v_session.status <> 'ongoing' then
    raise exception 'Session is not ongoing';
  end if;

  update class_sessions
  set status = 'completed', actual_end = now()
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;
