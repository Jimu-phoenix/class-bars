-- =====================================================================
-- Class-BARS Migration 10: course attendance export (roster x sessions)
-- Applies on top of 09_role_server_side.sql
--
-- 1. RPC get_course_attendance -- returns the enrolled-student roster
--    for a course crossed with every session of that course, left-joined
--    to attendance_records so a student who never checked in shows up
--    with status 'absent'. This is what lecturers export to CSV.
--
--    Ownership: the caller may only export a course they lecture, either
--    via courses.lecturer_id (migration 08) or by owning at least one
--    class_sessions row in the course (works while 08 is still pending
--    on the live DB).
--
-- Re-runnable (idempotent).
-- =====================================================================

create or replace function public.get_course_attendance(
  p_course_id uuid
) returns table (
  session_id        uuid,
  session_start     timestamptz,
  student_id        uuid,
  student_name      text,
  student_number    text,
  method            attendance_method,
  status            attendance_status,
  check_in_time     timestamptz,
  confidence_score  numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course       courses;
  v_is_lecturer  boolean;
begin
  select * into v_course from courses where id = p_course_id;
  if v_course.id is null then
    raise exception 'Course not found';
  end if;

  -- Caller must be the course lecturer: either the courses.lecturer_id
  -- matches (post-08) or they own at least one session in the course.
  select exists (
    select 1 from class_sessions cs
    where cs.course_id = p_course_id
      and cs.lecturer_id = auth.uid()
  ) or v_course.lecturer_id = auth.uid()
  into v_is_lecturer;

  if not coalesce(v_is_lecturer, false) then
    raise exception 'Only the course lecturer can export its attendance';
  end if;

  return query
    select
      cs.id                        as session_id,
      cs.scheduled_start           as session_start,
      st.id                        as student_id,
      st.full_name                 as student_name,
      st.student_number,
      ar.method,
      coalesce(ar.status, 'absent'::attendance_status) as status,
      ar.check_in_time,
      ar.confidence_score
    from class_sessions cs
    cross join enrollments en
    join profiles st on st.id = en.student_id
    left join attendance_records ar
      on ar.session_id = cs.id
     and ar.student_id = st.id
    where cs.course_id = p_course_id
      and en.course_id = p_course_id
    order by cs.scheduled_start asc, st.full_name asc;
end;
$$;

comment on function public.get_course_attendance(uuid) is
  'Roster x sessions for one course, with attendance status (absent when no record). Lecturer-scoped.';

grant execute on function
  public.get_course_attendance(uuid)
  to anon, authenticated;