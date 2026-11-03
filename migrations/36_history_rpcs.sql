-- =====================================================================
-- Class-BARS Migration 36: attendance history RPCs
--
-- Adds read-only history RPCs:
--   get_lecturer_sessions(p_course_id, p_limit, p_offset) -> lecturer's sessions
--   search_my_students(p_query, p_limit) -> students matching a query
--   get_student_history_for_lecturer(p_student_id, p_course_id) -> a student's results
--   get_my_history(p_course_id) -> the caller's own results for a course
--   get_student_header_for_lecturer(p_student_id) -> student header + enrolment check
--
-- All are STABLE SECURITY DEFINER with a fixed search_path, lecturer-only
-- (is_lecturer_user()), explicit ::text casts, revoked from public/anon and
-- granted to authenticated. Run on a Supabase branch/staging project first.
-- =====================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- 1. get_lecturer_sessions(p_course_id, p_limit, p_offset)
-- Returns the lecturer's sessions across all courses (or one course when
-- p_course_id is not null), newest first, with checked-in counts and a
-- stable total_count for pagination. Cancelled sessions are excluded.
-- ---------------------------------------------------------------------
create or replace function public.get_lecturer_sessions(
  p_course_id uuid,
  p_limit int,
  p_offset int
) returns table (
  session_id        uuid,
  course_id         uuid,
  course_code       text,
  course_name       text,
  venue_name        text,
  scheduled_start   timestamptz,
  actual_start      timestamptz,
  status            text,
  checked_in_count  int,
  total_count       int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_lecturer uuid := auth.uid();
  v_total    int;
begin
  if v_lecturer is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_lecturer_user() then
    raise exception 'Only lecturers can view sessions';
  end if;

  select count(*) into v_total
  from public.class_sessions cs
  where cs.lecturer_id = v_lecturer
    and (p_course_id is null or cs.course_id = p_course_id)
    and cs.status <> 'cancelled';

  return query
  select
    cs.id              as session_id,
    cs.course_id       as course_id,
    c.course_code      as course_code,
    c.course_name      as course_name,
    coalesce(v.name, ''::text) as venue_name,
    cs.scheduled_start as scheduled_start,
    cs.actual_start    as actual_start,
    cs.status::text    as status,
    coalesce((
      select count(*)
      from public.attendance_records ar
      where ar.session_id = cs.id
    ), 0)               as checked_in_count,
    v_total             as total_count
  from public.class_sessions cs
  join public.courses c on c.id = cs.course_id
  left join public.venues v on v.id = cs.venue_id
  where cs.lecturer_id = v_lecturer
    and (p_course_id is null or cs.course_id = p_course_id)
    and cs.status <> 'cancelled'
  order by cs.scheduled_start desc nulls last, cs.id desc
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.get_lecturer_sessions(uuid, int, int) from public, anon;
grant execute on function public.get_lecturer_sessions(uuid, int, int) to authenticated;

-- ---------------------------------------------------------------------
-- 2. search_my_students(p_query, p_limit)
-- Server-side student search for a lecturer: students enrolled in at least
-- one of the lecturer's courses, matched by full name or registration
-- number. Returns nothing for queries shorter than 2 characters.
-- ---------------------------------------------------------------------
create or replace function public.search_my_students(
  p_query text,
  p_limit int
) returns table (
  student_id        uuid,
  full_name         text,
  registration_number text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_lecturer uuid := auth.uid();
  v_query    text;
begin
  if v_lecturer is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_lecturer_user() then
    raise exception 'Only lecturers can search students';
  end if;

  v_query := trim(coalesce(p_query, ''));
  if length(v_query) < 2 then
    return;
  end if;

  return query
  select distinct
    p.id             as student_id,
    p.full_name      as full_name,
    p.student_number as registration_number
  from public.enrollments e
  join public.profiles p on p.id = e.student_id
  join public.courses c on c.id = e.course_id
  where c.lecturer_id = v_lecturer
    and (
      p.full_name ilike '%' || v_query || '%'
      or p.student_number ilike '%' || v_query || '%'
    )
  order by p.full_name asc nulls last, p.student_number asc nulls last
  limit p_limit;
end;
$$;

revoke all on function public.search_my_students(text, int) from public, anon;
grant execute on function public.search_my_students(text, int) to authenticated;

-- ---------------------------------------------------------------------
-- 3. list_my_students()
-- Returns every distinct student enrolled in at least one of the lecturer's
-- courses, with the distinct course codes (as text[]) of that lecturer's
-- courses the student is in. Hard cap LIMIT 1000. No email, no face data,
-- no other profile fields.
-- ---------------------------------------------------------------------
create or replace function public.list_my_students() returns table (
  student_id        uuid,
  full_name         text,
  registration_number text,
  course_codes      text[]
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_lecturer uuid := auth.uid();
begin
  if v_lecturer is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_lecturer_user() then
    raise exception 'Only lecturers can list students';
  end if;

  return query
  select
    p.id                  as student_id,
    p.full_name           as full_name,
    p.student_number      as registration_number,
    array_agg(distinct c.course_code::text order by c.course_code::text)
      as course_codes
  from public.enrollments e
  join public.profiles p on p.id = e.student_id
  join public.courses c on c.id = e.course_id
  where c.lecturer_id = v_lecturer
  group by p.id, p.full_name, p.student_number
  order by p.full_name asc nulls last, p.id asc
  limit 1000;
end;
$$;

revoke all on function public.list_my_students() from public, anon;
grant execute on function public.list_my_students() to authenticated;

-- ---------------------------------------------------------------------
-- 4. get_student_history_for_lecturer(p_student_id, p_course_id)
-- One row per non-cancelled session of a course, with result derivation:
--   record present  -> result = record status (present/late/flagged/absent)
--   completed, no record -> 'absent'
--   ongoing, no record   -> 'live'
--   scheduled, no record -> 'upcoming'
-- Sessions before the student's enrolment date are excluded unless a record
-- exists. The student must be enrolled in at least one of the lecturer's
-- courses (else 'Student not found in your courses').
-- ---------------------------------------------------------------------
create or replace function public.get_student_history_for_lecturer(
  p_student_id uuid,
  p_course_id  uuid
) returns table (
  session_id      uuid,
  course_id       uuid,
  course_code     text,
  course_name     text,
  session_start   timestamptz,
  session_status  text,
  result          text,
  method          text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_lecturer   uuid := auth.uid();
  v_enrolled   boolean;
  v_enrolled_at timestamptz;
begin
  if v_lecturer is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_lecturer_user() then
    raise exception 'Only lecturers can view student history';
  end if;

  select exists (
    select 1 from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.student_id = p_student_id
      and c.lecturer_id = v_lecturer
  ) into v_enrolled;

  if not v_enrolled then
    raise exception 'Student not found in your courses';
  end if;

  select min(e.created_at) into v_enrolled_at
  from public.enrollments e
  where e.student_id = p_student_id
    and e.course_id = p_course_id;

  return query
  select
    cs.id             as session_id,
    cs.course_id      as course_id,
    c.course_code     as course_code,
    c.course_name     as course_name,
    cs.scheduled_start as session_start,
    cs.status::text    as session_status,
    case
      when ar.id is not null then ar.status::text
      when cs.status = 'completed' then 'absent'
      when cs.status = 'ongoing' then 'live'
      when cs.status = 'scheduled' then 'upcoming'
      else null
    end                as result,
    ar.method::text     as method
  from public.class_sessions cs
  join public.courses c on c.id = cs.course_id
  left join public.attendance_records ar
    on ar.session_id = cs.id
   and ar.student_id = p_student_id
  where cs.lecturer_id = v_lecturer
    and cs.course_id = p_course_id
    and cs.status <> 'cancelled'
    and (
      ar.id is not null
      or (v_enrolled_at is not null and cs.scheduled_start >= v_enrolled_at)
    )
  order by cs.scheduled_start desc nulls last, cs.id desc;
end;
$$;

revoke all on function public.get_student_history_for_lecturer(uuid, uuid) from public, anon;
grant execute on function public.get_student_history_for_lecturer(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. get_my_history(p_course_id)
-- The caller's own session results for one course. Same result derivation
-- as get_student_history_for_lecturer but no method column (students never
-- see methods). Raises 'You are not enrolled in this course' when the
-- caller has no enrolment for the course.
-- ---------------------------------------------------------------------
create or replace function public.get_my_history(
  p_course_id uuid
) returns table (
  session_id     uuid,
  session_start  timestamptz,
  session_status text,
  result         text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_student     uuid := auth.uid();
  v_enrolled_at timestamptz;
begin
  if v_student is null then
    raise exception 'Not authenticated';
  end if;

  select min(e.created_at) into v_enrolled_at
  from public.enrollments e
  where e.student_id = v_student
    and e.course_id = p_course_id;

  if v_enrolled_at is null then
    raise exception 'You are not enrolled in this course';
  end if;

  return query
  select
    cs.id             as session_id,
    cs.scheduled_start as session_start,
    cs.status::text    as session_status,
    case
      when ar.id is not null then ar.status::text
      when cs.status = 'completed' then 'absent'
      when cs.status = 'ongoing' then 'live'
      when cs.status = 'scheduled' then 'upcoming'
      else null
    end                as result
  from public.class_sessions cs
  left join public.attendance_records ar
    on ar.session_id = cs.id
   and ar.student_id = v_student
  where cs.course_id = p_course_id
    and cs.status <> 'cancelled'
    and (
      ar.id is not null
      or (v_enrolled_at is not null and cs.scheduled_start >= v_enrolled_at)
    )
  order by cs.scheduled_start desc nulls last, cs.id desc;
end;
$$;

revoke all on function public.get_my_history(uuid) from public, anon;
grant execute on function public.get_my_history(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. get_student_header_for_lecturer(p_student_id)
-- Returns the student's name + registration number only when the student is
-- enrolled in at least one of the lecturer's courses; otherwise raises
-- 'Student not found in your courses'. Used so a refresh or direct link to
-- /dashboard/students/:id resolves the header server-side.
-- ---------------------------------------------------------------------
create or replace function public.get_student_header_for_lecturer(
  p_student_id uuid
) returns table (
  student_id        uuid,
  full_name         text,
  registration_number text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_lecturer uuid := auth.uid();
  v_found    boolean;
begin
  if v_lecturer is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_lecturer_user() then
    raise exception 'Only lecturers can view student headers';
  end if;

  select exists (
    select 1 from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.student_id = p_student_id
      and c.lecturer_id = v_lecturer
  ) into v_found;

  if not v_found then
    raise exception 'Student not found in your courses';
  end if;

  return query
  select
    p.id             as student_id,
    p.full_name      as full_name,
    p.student_number as registration_number
  from public.profiles p
  where p.id = p_student_id;
end;
$$;

revoke all on function public.get_student_header_for_lecturer(uuid) from public, anon;
grant execute on function public.get_student_header_for_lecturer(uuid) to authenticated;

commit;
