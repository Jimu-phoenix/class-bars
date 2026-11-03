-- =====================================================================
-- Class-BARS history checks (migration 36)
--
-- MANUAL TEST. Run in the Supabase SQL Editor as postgres after applying
-- migrations/36_history_rpcs.sql.
--
-- Creates temporary fixtures, exercises all five history RPCs, asserts
-- cross-lecturer isolation, enrolment-date rules, result derivation,
-- search behaviour, pagination, privilege locks and output-column safety,
-- then rolls everything back.
-- =====================================================================

begin;

select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

-- ---------------------------------------------------------------------
-- Fixtures: two lecturers, three students, one admin.
-- ---------------------------------------------------------------------
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, is_anonymous) values
  ('00000000-0000-4000-8000-000000000b01', 'authenticated', 'authenticated', 'hst-student-a@example.invalid', now(), '{"full_name":"History Student A","role":"student"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000b02', 'authenticated', 'authenticated', 'hst-student-b@example.invalid', now(), '{"full_name":"History Student B","role":"student"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000b03', 'authenticated', 'authenticated', 'hst-student-both@example.invalid', now(), '{"full_name":"History Student Both","role":"student"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000b04', 'authenticated', 'authenticated', 'hst-lecturer-a@example.invalid', now(), '{"full_name":"History Lecturer A","role":"lecturer"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000b05', 'authenticated', 'authenticated', 'hst-lecturer-b@example.invalid', now(), '{"full_name":"History Lecturer B","role":"lecturer"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000b06', 'authenticated', 'authenticated', 'hst-admin@example.invalid', now(), '{"full_name":"History Admin","role":"admin"}'::jsonb, false)
on conflict (id) do nothing;

insert into public.profiles (id, full_name, role, student_number) values
  ('00000000-0000-4000-8000-000000000b01', 'History Student A', 'student', 'HST-001'),
  ('00000000-0000-4000-8000-000000000b02', 'History Student B', 'student', 'HST-002'),
  ('00000000-0000-4000-8000-000000000b03', 'History Student Both', 'student', 'HST-003'),
  ('00000000-0000-4000-8000-000000000b04', 'History Lecturer A', 'lecturer', null),
  ('00000000-0000-4000-8000-000000000b05', 'History Lecturer B', 'lecturer', null),
  ('00000000-0000-4000-8000-000000000b06', 'History Admin', 'admin', null)
on conflict (id) do update
set full_name = excluded.full_name, role = excluded.role, student_number = excluded.student_number;

-- Courses: A (lecturer A), B (lecturer B), A2 (lecturer A, student A not enrolled).
insert into public.courses (id, course_code, course_name, lecturer_id) values
  ('00000000-0000-4000-8000-000000001b01', 'HIST-101', 'History course A', '00000000-0000-4000-8000-000000000b04'),
  ('00000000-0000-4000-8000-000000001b02', 'HIST-102', 'History course B', '00000000-0000-4000-8000-000000000b05'),
  ('00000000-0000-4000-8000-000000001b03', 'HIST-103', 'History course A2', '00000000-0000-4000-8000-000000000b04')
on conflict (id) do update set course_name = excluded.course_name, lecturer_id = excluded.lecturer_id;

-- Enrolments. Student A enrolled 30 days ago in course A only.
insert into public.enrollments (student_id, course_id, academic_year, semester, created_at) values
  ('00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-000000001b01', '2026', '1', now() - interval '30 days'),
  ('00000000-0000-4000-8000-000000000b03', '00000000-0000-4000-8000-000000001b01', '2026', '1', now() - interval '50 days'),
  ('00000000-0000-4000-8000-000000000b03', '00000000-0000-4000-8000-000000001b03', '2026', '1', now() - interval '50 days'),
  ('00000000-0000-4000-8000-000000000b03', '00000000-0000-4000-8000-000000001b02', '2026', '1', now() - interval '10 days'),
  ('00000000-0000-4000-8000-000000000b02', '00000000-0000-4000-8000-000000001b02', '2026', '1', now() - interval '10 days')
on conflict (student_id, course_id, academic_year, semester) do nothing;

insert into public.venues (id, name) values
  ('00000000-0000-4000-8000-000000002b01', 'History Room A'),
  ('00000000-0000-4000-8000-000000002b02', 'History Room B')
on conflict (id) do update set name = excluded.name;

create function pg_temp.hst_session(
  p_course_id uuid,
  p_lecturer_id uuid,
  p_status text,
  p_start timestamptz
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.class_sessions (
    course_id, lecturer_id, venue_id, scheduled_start, scheduled_end, status, actual_start
  ) values (
    p_course_id, p_lecturer_id, '00000000-0000-4000-8000-000000002b01',
    p_start, p_start + interval '1 hour', p_status::session_status, p_start
  )
  returning id into v_id;
  return v_id;
end;
$$;

do $$
declare
  v_lec_a   uuid := '00000000-0000-4000-8000-000000000b04';
  v_lec_b   uuid := '00000000-0000-4000-8000-000000000b05';
  v_stu_a   uuid := '00000000-0000-4000-8000-000000000b01';
  v_stu_b   uuid := '00000000-0000-4000-8000-000000000b02';
  v_stu_both uuid := '00000000-0000-4000-8000-000000000b03';
  v_adm     uuid := '00000000-0000-4000-8000-000000000b06';
  v_course_a uuid := '00000000-0000-4000-8000-000000001b01';
  v_course_b uuid := '00000000-0000-4000-8000-000000001b02';
  v_course_a2 uuid := '00000000-0000-4000-8000-000000001b03';

  v_s_old_norec uuid;   -- completed -35d, no record -> excluded
  v_s_old_rec uuid;     -- completed -40d, with record -> included
  v_s_recent_norec uuid;-- completed -15d, no record -> absent
  v_s_live uuid;        -- ongoing -> live
  v_s_sched uuid;       -- scheduled -> upcoming
  v_s_course_a2 uuid;   -- lecturer A's second course, stu-a not enrolled
  v_s_b uuid;           -- lecturer B's session with record for stu-b
  v_anon_rec uuid;      -- anonymised record (student_id NULL) for lecturer B's session
  v_found boolean;

  v_cnt int;
  v_row record;
begin
  -- ------------------------------------------------------------------
  -- Sessions for lecturer A (course A).
  -- ------------------------------------------------------------------
  v_s_old_norec := pg_temp.hst_session(v_course_a, v_lec_a, 'completed', now() - interval '35 days');
  v_s_old_rec   := pg_temp.hst_session(v_course_a, v_lec_a, 'completed', now() - interval '40 days');
  v_s_recent_norec := pg_temp.hst_session(v_course_a, v_lec_a, 'completed', now() - interval '15 days');
  v_s_live      := pg_temp.hst_session(v_course_a, v_lec_a, 'ongoing', now());
  v_s_sched     := pg_temp.hst_session(v_course_a, v_lec_a, 'scheduled', now() + interval '7 days');
  v_s_course_a2 := pg_temp.hst_session(v_course_a2, v_lec_a, 'completed', now() - interval '5 days');
  v_s_flagged   := pg_temp.hst_session(v_course_a, v_lec_a, 'completed', now() - interval '10 days');

  -- Record for stu-a on the -40d session (present).
  insert into public.attendance_records (session_id, student_id, method, status, check_in_time)
  values (v_s_old_rec, v_stu_a, 'face', 'present', now() - interval '40 days');

  -- Flagged record for stu-a on the -10d session (tests method + flagged result).
  insert into public.attendance_records (session_id, student_id, method, status, flag_reason, check_in_time)
  values (v_s_flagged, v_stu_a, 'otp', 'flagged', 'face_review', now() - interval '10 days');

  -- ------------------------------------------------------------------
  -- Sessions for lecturer B (course B), with a record for stu-b and an
  -- anonymised copy (student_id NULL) that must never appear.
  -- ------------------------------------------------------------------
  v_s_b := pg_temp.hst_session(v_course_b, v_lec_b, 'completed', now() - interval '20 days');
  insert into public.attendance_records (session_id, student_id, method, status, check_in_time)
  values (v_s_b, v_stu_b, 'manual', 'present', now() - interval '20 days');
  insert into public.attendance_records (session_id, student_id, method, status, check_in_time)
  values (v_s_b, null, 'face', 'present', now() - interval '20 days');

  -- ------------------------------------------------------------------
  -- 1. Output columns of all five functions contain none of the
  --    sensitive attendance fields.
  -- ------------------------------------------------------------------
  for v_row in
    select proname, prosrc from pg_proc where proname in (
      'get_lecturer_sessions', 'search_my_students',
      'get_student_history_for_lecturer', 'get_my_history',
      'get_student_header_for_lecturer'
    )
  loop
    if v_row.prosrc ilike '%flag_reason%' or
       v_row.prosrc ilike '%match_score%' or
       v_row.prosrc ilike '%match_band%' or
       v_row.prosrc ilike '%match_distance%' or
       v_row.prosrc ilike '%location_distance_m%' or
       v_row.prosrc ilike '%location_accuracy_m%' or
       v_row.prosrc ilike '%confidence_score%' then
      raise exception 'FAIL: % exposes a sensitive field', v_row.proname;
    end if;
  end loop;

  -- ------------------------------------------------------------------
  -- 2. Anon has no execute privilege on any of the five functions.
  -- ------------------------------------------------------------------
  if public.has_function_privilege(
       'anon',
       'public.get_lecturer_sessions(uuid, int, int)'::regprocedure,
       'execute'
     ) then
    raise exception 'FAIL: anon should not have execute on get_lecturer_sessions';
  end if;
  if public.has_function_privilege(
       'anon',
       'public.search_my_students(text, int)'::regprocedure,
       'execute'
     ) then
    raise exception 'FAIL: anon should not have execute on search_my_students';
  end if;
  if public.has_function_privilege(
       'anon',
       'public.get_student_history_for_lecturer(uuid, uuid)'::regprocedure,
       'execute'
     ) then
    raise exception 'FAIL: anon should not have execute on get_student_history_for_lecturer';
  end if;
  if public.has_function_privilege(
       'anon',
       'public.get_my_history(uuid)'::regprocedure,
       'execute'
     ) then
    raise exception 'FAIL: anon should not have execute on get_my_history';
  end if;
  if public.has_function_privilege(
       'anon',
       'public.get_student_header_for_lecturer(uuid)'::regprocedure,
       'execute'
     ) then
    raise exception 'FAIL: anon should not have execute on get_student_header_for_lecturer';
  end if;

  -- ------------------------------------------------------------------
  -- 3. Lecturer A sees only their own sessions (not lecturer B's).
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_lec_a, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt
  from public.get_lecturer_sessions(null, 20, 0);
  if v_cnt <> 7 then
    raise exception 'FAIL: lecturer A should see 7 sessions (course A x6 + course A2 x1), got %', v_cnt;
  end if;
  select bool_or(session_id = v_s_b) into v_found
  from public.get_lecturer_sessions(null, 20, 0);
  if v_found then
    raise exception 'FAIL: lecturer A must not see lecturer B session %', v_s_b;
  end if;

  -- ------------------------------------------------------------------
  -- 4. Lecturer B cannot see lecturer A's sessions/students/records,
  --    including the anonymised record (student_id NULL).
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_lec_b, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt
  from public.get_lecturer_sessions(null, 20, 0);
  if v_cnt <> 1 then
    raise exception 'FAIL: lecturer B should see 1 session, got %', v_cnt;
  end if;

  select count(*) into v_cnt
  from public.get_student_history_for_lecturer(v_stu_a, v_course_a);
  if v_cnt <> 0 then
    raise exception 'FAIL: lecturer B must not see student A history (% rows)', v_cnt;
  end if;

  -- Lecturer B searching 'HST' sees only student B (not student A).
  select count(*) into v_cnt
  from public.search_my_students('HST', 20);
  if v_cnt <> 2 then
    raise exception 'FAIL: lecturer B search HST should return 2 students (B + both), got %', v_cnt;
  end if;
  select bool_or(student_id = v_stu_a) into v_found
  from public.search_my_students('HST', 20);
  if v_found then
    raise exception 'FAIL: lecturer B must not see student A in search';
  end if;

  -- ------------------------------------------------------------------
  -- 5. Student in both courses: lecturer A sees only A's sessions for
  --    that student (not B's session).
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_lec_a, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt
  from public.get_student_history_for_lecturer(v_stu_both, v_course_a);
  if v_cnt <> 5 then
    raise exception 'FAIL: lecturer A should see 5 sessions for student both in course A, got %', v_cnt;
  end if;
  select bool_or(session_id = v_s_b) into v_found
  from public.get_student_history_for_lecturer(v_stu_both, v_course_a);
  if v_found then
    raise exception 'FAIL: lecturer A must not include lecturer B session in student both history';
  end if;

  -- ------------------------------------------------------------------
  -- 6. Student never sees sessions of a course they are not enrolled in
  --    (course A2 for student A).
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_stu_a, 'role', 'authenticated')::text, true);
  begin
    perform public.get_my_history(v_course_a2);
    raise exception 'FAIL: get_my_history for non-enrolled course accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%You are not enrolled in this course%' then
      raise exception 'FAIL: wrong error %', sqlerrm;
    end if;
  end;

  -- ------------------------------------------------------------------
  -- 7. Student A enrolment-date rule (enrolled 30 days ago):
  --    - completed -35d NO record -> excluded
  --    - completed -40d WITH record -> included (present)
  --    - completed -15d NO record -> absent
  --    - ongoing -> live, scheduled -> upcoming
  -- ------------------------------------------------------------------
  select count(*) into v_cnt
  from public.get_my_history(v_course_a);
  if v_cnt <> 5 then
    raise exception 'FAIL: student A should see 5 sessions (old_rec present, recent_norec absent, s_flagged flagged, live, sched), got %', v_cnt;
  end if;

  select session_status, result into v_row
  from public.get_my_history(v_course_a)
  where session_id = v_s_old_rec;
  if v_row.session_status <> 'completed' or v_row.result <> 'present' then
    raise exception 'FAIL: old_rec should be present, got %, %', v_row.session_status, v_row.result;
  end if;

  select result into v_row.result
  from public.get_my_history(v_course_a)
  where session_id = v_s_recent_norec;
  if v_row.result <> 'absent' then
    raise exception 'FAIL: recent_norec should be absent, got %', v_row.result;
  end if;

  select result into v_row.result
  from public.get_my_history(v_course_a)
  where session_id = v_s_flagged;
  if v_row.result <> 'flagged' then
    raise exception 'FAIL: s_flagged should be flagged, got %', v_row.result;
  end if;

  select result into v_row.result
  from public.get_my_history(v_course_a)
  where session_id = v_s_live;
  if v_row.result <> 'live' then
    raise exception 'FAIL: live session should be live, got %', v_row.result;
  end if;

  select result into v_row.result
  from public.get_my_history(v_course_a)
  where session_id = v_s_sched;
  if v_row.result <> 'upcoming' then
    raise exception 'FAIL: scheduled session should be upcoming, got %', v_row.result;
  end if;

  -- ------------------------------------------------------------------
  -- 8. Result derivation for lecturer: present/late/flagged from record;
  --    late and flagged count as present; method badge present.
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_lec_a, 'role', 'authenticated')::text, true);
  select method, result into v_row
  from public.get_student_history_for_lecturer(v_stu_a, v_course_a)
  where session_id = v_s_flagged;
  if v_row.method <> 'otp' or v_row.result <> 'flagged' then
    raise exception 'FAIL: s_flagged for lecturer should be otp/flagged, got %, %', v_row.method, v_row.result;
  end if;

  -- ------------------------------------------------------------------
  -- 9. Role locks: students/admins cannot call lecturer RPCs; lecturer
  --    cannot call get_my_history; anon cannot call anything.
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_stu_a, 'role', 'authenticated')::text, true);
  begin
    perform public.get_lecturer_sessions(null, 20, 0);
    raise exception 'FAIL: student get_lecturer_sessions accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform public.get_my_history(v_course_a);
    raise exception 'FAIL: student get_my_history accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  begin
    perform public.get_lecturer_sessions(null, 20, 0);
    raise exception 'FAIL: admin get_lecturer_sessions accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_lec_a, 'role', 'authenticated')::text, true);
  begin
    perform public.get_my_history(v_course_a);
    raise exception 'FAIL: lecturer get_my_history accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- ------------------------------------------------------------------
  -- 10. get_student_header_for_lecturer: works for shared student,
  --     raises for non-shared.
  -- ------------------------------------------------------------------
  select student_id, full_name, registration_number into v_row
  from public.get_student_header_for_lecturer(v_stu_a);
  if v_row.student_id <> v_stu_a or v_row.full_name <> 'History Student A' then
    raise exception 'FAIL: student header wrong: %, %', v_row.student_id, v_row.full_name;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_lec_b, 'role', 'authenticated')::text, true);
  begin
    perform public.get_student_header_for_lecturer(v_stu_a);
    raise exception 'FAIL: lecturer B header for student A accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%Student not found in your courses%' then
      raise exception 'FAIL: wrong header error %', sqlerrm;
    end if;
  end;

  -- ------------------------------------------------------------------
  -- 11. Student cannot call get_student_header_for_lecturer.
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_stu_a, 'role', 'authenticated')::text, true);
  begin
    perform public.get_student_header_for_lecturer(v_stu_a);
    raise exception 'FAIL: student get_student_header accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- ------------------------------------------------------------------
  -- 12. Search: min 2 chars, '%' matches nothing, limit clamping,
  --     matches name and registration number, lecturer A 'HST' returns
  --     both students in course A, lecturer B only their own.
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_lec_a, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.search_my_students('H', 20);
  if v_cnt <> 0 then
    raise exception 'FAIL: 1-char query should return nothing, got %', v_cnt;
  end if;
  select count(*) into v_cnt from public.search_my_students('%', 20);
  if v_cnt <> 0 then
    raise exception 'FAIL: wildcard query should return nothing, got %', v_cnt;
  end if;
  select count(*) into v_cnt from public.search_my_students('Student A', 20);
  if v_cnt <> 1 then
    raise exception 'FAIL: search Student A should return 1, got %', v_cnt;
  end if;
  select count(*) into v_cnt from public.search_my_students('HST-003', 20);
  if v_cnt <> 1 then
    raise exception 'FAIL: search HST-003 should return 1 (student both), got %', v_cnt;
  end if;
  select count(*) into v_cnt from public.search_my_students('HST', 1);
  if v_cnt <> 1 then
    raise exception 'FAIL: limit 1 should return 1, got %', v_cnt;
  end if;
  select count(*) into v_cnt from public.search_my_students('HST', 20);
  if v_cnt <> 2 then
    raise exception 'FAIL: lecturer A search HST should return 2 (student A + both), got %', v_cnt;
  end if;

  -- ------------------------------------------------------------------
  -- 13. Pagination: limit/offset/total_count; hide load more when at end.
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_lec_a, 'role', 'authenticated')::text, true);
  -- total_count is the same on every row; grab it.
  select max(total_count) into v_cnt from public.get_lecturer_sessions(null, 2, 0);
  if v_cnt <> 7 then
    raise exception 'FAIL: total_count should be 7, got %', v_cnt;
  end if;
  select count(*) into v_cnt from public.get_lecturer_sessions(null, 2, 0);
  if v_cnt <> 2 then
    raise exception 'FAIL: page 1 should return 2, got %', v_cnt;
  end if;
  select count(*) into v_cnt from public.get_lecturer_sessions(null, 2, 2);
  if v_cnt <> 2 then
    raise exception 'FAIL: page 2 should return 2, got %', v_cnt;
  end if;
  select count(*) into v_cnt from public.get_lecturer_sessions(null, 2, 4);
  if v_cnt <> 2 then
    raise exception 'FAIL: page 3 should return 2, got %', v_cnt;
  end if;
  select count(*) into v_cnt from public.get_lecturer_sessions(null, 2, 6);
  if v_cnt <> 1 then
    raise exception 'FAIL: page 4 should return 1, got %', v_cnt;
  end if;
  select count(*) into v_cnt from public.get_lecturer_sessions(null, 2, 8);
  if v_cnt <> 0 then
    raise exception 'FAIL: page 5 should return 0, got %', v_cnt;
  end if;

  -- ------------------------------------------------------------------
  -- 14. list_my_students checks.
  -- ------------------------------------------------------------------
  -- Output columns contain only the four fields (no sensitive fields).
  select prosrc into v_row
  from pg_proc where proname = 'list_my_students';
  if v_row.prosrc ilike '%flag_reason%' or
     v_row.prosrc ilike '%match_score%' or
     v_row.prosrc ilike '%match_band%' or
     v_row.prosrc ilike '%match_distance%' or
     v_row.prosrc ilike '%location_distance_m%' or
     v_row.prosrc ilike '%location_accuracy_m%' or
     v_row.prosrc ilike '%confidence_score%' then
    raise exception 'FAIL: list_my_students exposes a sensitive field';
  end if;

  -- Lecturer A gets exactly their students; student Both appears once with
  -- both course codes (HIST-101 and HIST-103).
  perform set_config('request.jwt.claims', json_build_object('sub', v_lec_a, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt
  from public.list_my_students();
  if v_cnt <> 2 then
    raise exception 'FAIL: lecturer A should see 2 students, got %', v_cnt;
  end if;

  select array_agg(course_codes order by course_codes) into v_row
  from (
    select course_codes from public.list_my_students() where student_id = v_stu_both
  ) sub;
  if v_row.array_agg is null or cardinality(v_row.array_agg) <> 2 then
    raise exception 'FAIL: student Both should have 2 course codes under lecturer A, got %', v_row.array_agg;
  end if;

  -- Lecturer B never sees lecturer A's students.
  perform set_config('request.jwt.claims', json_build_object('sub', v_lec_b, 'role', 'authenticated')::text, true);
  select bool_or(student_id = v_stu_a) into v_found
  from public.list_my_students();
  if v_found then
    raise exception 'FAIL: lecturer B must not see student A';
  end if;

  -- Role locks: student, admin cannot call list_my_students.
  perform set_config('request.jwt.claims', json_build_object('sub', v_stu_a, 'role', 'authenticated')::text, true);
  begin
    perform public.list_my_students();
    raise exception 'FAIL: student list_my_students accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  begin
    perform public.list_my_students();
    raise exception 'FAIL: admin list_my_students accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- Anon has no execute privilege.
  if public.has_function_privilege(
       'anon',
       'public.list_my_students()'::regprocedure,
       'execute'
     ) then
    raise exception 'FAIL: anon should not have execute on list_my_students';
  end if;

  -- 1000 cap clause exists in the function source.
  select prosrc into v_row
  from pg_proc where proname = 'list_my_students';
  if v_row.prosrc not like '%limit 1000%' then
    raise exception 'FAIL: list_my_students missing LIMIT 1000 cap';
  end if;

  raise notice 'PASS: all history checks passed';
end;
$$;

rollback;
