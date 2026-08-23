-- =====================================================================
-- Class-BARS Migration 01: security fixes + lecturer write policies
-- Applies on top of class_bars_schema_no_geo.sql
--
-- 1. check_in_attendance: verify caller identity + device ownership
-- 2. courses / venues: add missing SELECT policies (dashboard joins on
--    these tables silently returned NULL because RLS had zero policies)
-- 3. staff write policies for courses, venues, class_sessions
-- 4. immutability guards: profiles.role and courses.course_code cannot
--    be changed by client calls (service_role bypasses for trusted
--    server-side administration)
-- 5. optional demo venue seed (idempotent -- delete block if unwanted)
--
-- Re-runnable: replaces functions and drops/recreates its policies.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Helper: staff check.
-- SECURITY DEFINER so policies can inspect profiles without tripping
-- its own RLS (profiles policies only expose the caller's own row).
-- ---------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('lecturer', 'admin')
  );
$$;

-- ---------------------------------------------------------------------
-- courses: authenticated read; staff create/update
-- ---------------------------------------------------------------------
drop policy if exists "Authenticated users view courses" on courses;
create policy "Authenticated users view courses"
  on courses for select
  using (auth.role() = 'authenticated');

drop policy if exists "Staff create courses" on courses;
create policy "Staff create courses"
  on courses for insert
  with check (public.is_staff());

drop policy if exists "Staff update courses" on courses;
create policy "Staff update courses"
  on courses for update
  using (public.is_staff())
  with check (public.is_staff());

-- ---------------------------------------------------------------------
-- venues: authenticated read; staff create
-- ---------------------------------------------------------------------
drop policy if exists "Authenticated users view venues" on venues;
create policy "Authenticated users view venues"
  on venues for select
  using (auth.role() = 'authenticated');

drop policy if exists "Staff create venues" on venues;
create policy "Staff create venues"
  on venues for insert
  with check (public.is_staff());

-- ---------------------------------------------------------------------
-- class_sessions: assigned lecturer creates and maintains
-- ---------------------------------------------------------------------
drop policy if exists "Lecturers create own sessions" on class_sessions;
create policy "Lecturers create own sessions"
  on class_sessions for insert
  with check (
    lecturer_id = auth.uid()
    and public.is_staff()
  );

drop policy if exists "Lecturers update own sessions" on class_sessions;
create policy "Lecturers update own sessions"
  on class_sessions for update
  using (lecturer_id = auth.uid())
  with check (lecturer_id = auth.uid());

-- =====================================================================
-- RPC: harden check_in_attendance
-- Fixes impersonation hole: the previous body accepted any
-- p_student_id without proving the caller is that student.
-- Also rejects devices not registered to the caller.
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
  -- a caller may only ever check in as themselves
  if p_student_id is distinct from auth.uid() then
    raise exception 'Cannot check in on behalf of another student';
  end if;

  -- device, when supplied, must belong to the caller
  if p_device_id is not null and not exists (
    select 1 from devices
    where id = p_device_id
      and user_id = auth.uid()
  ) then
    raise exception 'Device is not registered to the calling user';
  end if;

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

-- =====================================================================
-- Immutability guards
-- Without these, the broad "Users update own profile" policy let any
-- user promote themselves to lecturer/admin by updating their own row.
-- Trusted server-side code (service_role JWT) remains able to change
-- these columns for account administration.
-- =====================================================================
create or replace function public.protect_profiles_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Role cannot be changed via client updates';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profiles_role on profiles;
create trigger trg_protect_profiles_role
  before update on profiles
  for each row
  execute function public.protect_profiles_role();

create or replace function public.protect_courses_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.course_code is distinct from old.course_code
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'course_code cannot be changed after creation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_courses_code on courses;
create trigger trg_protect_courses_code
  before update on courses
  for each row
  execute function public.protect_courses_code();

-- =====================================================================
-- Optional demo venues (idempotent). Remove this block for production.
-- =====================================================================
insert into venues (name, building)
select v.name, v.building
from (
  values
    ('LT1', 'Main Block'),
    ('LT2', 'Main Block'),
    ('Lab A', 'Science Complex')
) as v(name, building)
where not exists (
  select 1 from venues where venues.name = v.name
);
