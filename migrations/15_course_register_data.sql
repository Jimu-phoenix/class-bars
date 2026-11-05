-- Class-BARS Migration 15: Course register data for lecturer PDF export


drop function if exists public.get_register_data(uuid, uuid[]);

create or replace function public.get_register_data(
  p_course_id uuid,
  p_session_ids uuid[]
)
returns table (
  session_id uuid,
  session_start timestamptz,
  full_name text,
  registration_number text,
  status attendance_status
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_course public.courses;
  v_session_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_course
  from public.courses
  where id = p_course_id;

  if v_course.id is null then
    raise exception 'Course not found';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'lecturer'
  ) then
    raise exception 'Only lecturers can export registers';
  end if;

  if v_course.lecturer_id is distinct from auth.uid() then
    raise exception 'You are not assigned to this course';
  end if;

  if p_session_ids is null or array_ndims(p_session_ids) <> 1 then
    raise exception 'Select 2 to 8 sessions';
  end if;

  select count(*)
  into v_session_count
  from unnest(p_session_ids) as selected(id)
  where selected.id is not null;

  if v_session_count < 2 or v_session_count > 8 then
    raise exception 'Select 2 to 8 sessions';
  end if;

  if v_session_count <> cardinality(p_session_ids) then
    raise exception 'Session list contains invalid ids';
  end if;

  if (
    select count(distinct selected.id)
    from unnest(p_session_ids) as selected(id)
  ) <> v_session_count then
    raise exception 'Duplicate sessions are not allowed';
  end if;

  if exists (
    select 1
    from unnest(p_session_ids) as selected(id)
    left join public.class_sessions cs on cs.id = selected.id
    where cs.id is null
      or cs.course_id is distinct from p_course_id
      or cs.status <> 'completed'
  ) then
    raise exception 'Every session must be a completed session for this course';
  end if;

  return query
  with selected_sessions as (
    select cs.id, cs.scheduled_start
    from public.class_sessions cs
    where cs.id = any(p_session_ids)
      and cs.course_id = p_course_id
      and cs.status = 'completed'
  ),
  roster as (
    select distinct
      p.id as student_id,
      p.full_name,
      p.student_number
    from public.enrollments e
    join public.profiles p on p.id = e.student_id
    where e.course_id = p_course_id
  )
  select
    ss.id as session_id,
    ss.scheduled_start as session_start,
    r.full_name,
    r.student_number as registration_number,
    ar.status
  from selected_sessions ss
  left join roster r on true
  left join public.attendance_records ar
    on ar.session_id = ss.id
   and ar.student_id = r.student_id
  order by
    ss.scheduled_start asc,
    r.student_number asc nulls last,
    r.full_name asc nulls last;
end;
$$;

comment on function public.get_register_data(uuid, uuid[]) is
  'Returns roster names, registration numbers and final statuses for 2-8 completed sessions of an owned course.';

revoke all on function public.get_register_data(uuid, uuid[])
  from public, anon;
grant execute on function public.get_register_data(uuid, uuid[])
  to authenticated;
