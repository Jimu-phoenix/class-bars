-- Class-BARS Migration 06: real student/lecturer attendance flow

alter table face_embeddings rename column embedding_encrypted to embedding_json;

comment on column face_embeddings.embedding_json is
  'JSON array of the 128-d face descriptor. RLS exposes it only to the owner.';

drop policy if exists "Students view own enrollments" on enrollments;
create policy "Students view own enrollments"
  on enrollments for select
  using (student_id = auth.uid());

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

  update face_embeddings
  set is_active = false,
      updated_at = now()
  where user_id = auth.uid() and is_active;

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

create or replace function public.clear_face_embedding()
returns face_embeddings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row face_embeddings;
begin
  update face_embeddings
  set is_active = false,
      updated_at = now()
  where user_id = auth.uid() and is_active
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.enroll_self(
  p_course_code text,
  p_academic_year text default '2025',
  p_semester text default 'Semester 1'
) returns enrollments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course  courses;
  v_profile profiles;
  v_row     enrollments;
begin
  if p_course_code is null or trim(p_course_code) = '' then
    raise exception 'Course code is required';
  end if;

  select * into v_profile from profiles where id = auth.uid();
  if v_profile.id is null then
    raise exception 'Profile not found';
  end if;

  if v_profile.role <> 'student' then
    raise exception 'Only students can enroll in courses';
  end if;

  select * into v_course from courses
  where upper(course_code) = upper(trim(p_course_code));

  if v_course.id is null then
    raise exception 'Course not found';
  end if;

  insert into enrollments (student_id, course_id, academic_year, semester)
  values (
    auth.uid(),
    v_course.id,
    coalesce(nullif(trim(p_academic_year), ''), '2025'),
    coalesce(nullif(trim(p_semester), ''), 'Semester 1')
  )
  on conflict (student_id, course_id, academic_year, semester) do nothing
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.get_session_attendance(
  p_session_id uuid
) returns table (
  record_id       uuid,
  session_id      uuid,
  student_id      uuid,
  student_name    text,
  student_number  text,
  method          attendance_method,
  status          attendance_status,
  check_in_time   timestamptz,
  confidence_score numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session class_sessions;
begin
  select * into v_session from class_sessions where id = p_session_id;
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
      ar.confidence_score
    from attendance_records ar
    join profiles p on p.id = ar.student_id
    where ar.session_id = p_session_id
    order by ar.check_in_time asc nulls last;
end;
$$;