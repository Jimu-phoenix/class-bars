-- =====================================================================
-- Class-BARS Migration 11: lecturer roster (enrolled students)
-- Applies on top of 10_course_attendance_export.sql
--
-- 1. RPC get_lecturer_roster -- returns every student enrolled in a
--    course the caller lectures. RLS only exposes the caller's own
--    profile row, and a lecturer cannot read arbitrary profiles, so the
--    enrollments -> profiles join must happen inside a SECURITY DEFINER
--    function that first proves the caller lectures the course.
--
--    Scope: the caller may only read rosters for courses they lecture,
--    either via courses.lecturer_id (migration 08) or by owning at least
--    one class_sessions row in that course (works while 08 is still
--    pending on the live DB).
--
--    p_course_id may be omitted (or NULL) to return the roster for every
--    course the caller lectures, grouped by course in the result.
--
-- Re-runnable (idempotent).
-- =====================================================================

create or replace function public.get_lecturer_roster(
  p_course_id uuid default null
) returns table (
  course_id       uuid,
  course_code     text,
  course_name     text,
  student_id      uuid,
  student_name    text,
  student_number  text,
  academic_year   text,
  semester        text,
  enrolled_at     timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_lecturer boolean;
begin
  -- A course filter, when supplied, must itself be one the caller lectures.
  if p_course_id is not null then
    select exists (
      select 1 from courses c
      where c.id = p_course_id
        and (
          c.lecturer_id = auth.uid()
          or exists (
            select 1 from class_sessions cs
            where cs.course_id = c.id
              and cs.lecturer_id = auth.uid()
          )
        )
    ) into v_is_lecturer;

    if not coalesce(v_is_lecturer, false) then
      raise exception 'Only the course lecturer can view its roster';
    end if;
  end if;

  return query
    select
      c.id            as course_id,
      c.course_code,
      c.course_name,
      st.id           as student_id,
      st.full_name    as student_name,
      st.student_number,
      en.academic_year,
      en.semester,
      en.created_at   as enrolled_at
    from courses c
    join enrollments en on en.course_id = c.id
    join profiles st on st.id = en.student_id
    where (
        c.lecturer_id = auth.uid()
        or exists (
          select 1 from class_sessions cs
          where cs.course_id = c.id
            and cs.lecturer_id = auth.uid()
        )
      )
      and (p_course_id is null or c.id = p_course_id)
    order by c.course_code asc, st.full_name asc;
end;
$$;

comment on function public.get_lecturer_roster(uuid) is
  'All students enrolled in a course the caller lectures (or every such course when p_course_id is NULL). Lecturer-scoped.';

grant execute on function
  public.get_lecturer_roster(uuid)
  to anon, authenticated;
