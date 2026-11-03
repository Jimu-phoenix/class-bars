-- =====================================================================
-- Class-BARS lecturer manual mark checks
--
-- MANUAL TEST. Run in the Supabase SQL Editor as postgres after applying
-- migrations/35_lecturer_manual_mark.sql.
--
-- Creates temporary fixtures, exercises get_session_enrolled_students and
-- lecturer_mark_present, then rolls everything back.
-- =====================================================================

begin;

select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_user_meta_data, is_anonymous
) values
  ('00000000-0000-4000-8000-000000000a01', 'authenticated', 'authenticated',
   'manual-student@example.invalid', now(), '{"full_name":"Manual Student","role":"student"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000a02', 'authenticated', 'authenticated',
   'manual-lecturer-owner@example.invalid', now(), '{"full_name":"Manual Lecturer Owner","role":"lecturer"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000a03', 'authenticated', 'authenticated',
   'manual-lecturer-other@example.invalid', now(), '{"full_name":"Manual Lecturer Other","role":"lecturer"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000a04', 'authenticated', 'authenticated',
   'manual-admin@example.invalid', now(), '{"full_name":"Manual Admin","role":"admin"}'::jsonb, false)
on conflict (id) do nothing;

insert into public.profiles (id, full_name, role, student_number) values
  ('00000000-0000-4000-8000-000000000a01', 'Manual Student', 'student', 'MAN-001'),
  ('00000000-0000-4000-8000-000000000a02', 'Manual Lecturer Owner', 'lecturer', null),
  ('00000000-0000-4000-8000-000000000a03', 'Manual Lecturer Other', 'lecturer', null),
  ('00000000-0000-4000-8000-000000000a04', 'Manual Admin', 'admin', null)
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    student_number = excluded.student_number;

-- Second student (not enrolled) for negative tests.
insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_user_meta_data, is_anonymous
) values (
  '00000000-0000-4000-8000-000000000a05', 'authenticated', 'authenticated',
  'manual-other-student@example.invalid', now(),
  '{"full_name":"Manual Other Student","role":"student"}'::jsonb, false
) on conflict (id) do nothing;

insert into public.profiles (id, full_name, role, student_number) values
  ('00000000-0000-4000-8000-000000000a05', 'Manual Other Student', 'student', 'MAN-002')
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    student_number = excluded.student_number;

insert into public.courses (id, course_code, course_name, lecturer_id)
values (
  '00000000-0000-4000-8000-000000001a01',
  'MANUAL-101',
  'Manual mark test course',
  '00000000-0000-4000-8000-000000000a02'
)
on conflict (id) do update set course_name = excluded.course_name, lecturer_id = excluded.lecturer_id;

insert into public.enrollments (student_id, course_id, academic_year, semester)
values (
  '00000000-0000-4000-8000-000000000a01',
  '00000000-0000-4000-8000-000000001a01',
  '2026',
  '1'
)
on conflict (student_id, course_id, academic_year, semester) do nothing;

insert into public.venues (id, name)
values ('00000000-0000-4000-8000-000000002a01', 'Manual Test Room')
on conflict (id) do update set name = excluded.name;

insert into public.geofences (id, shape, center_lat, center_lng, radius_m)
values (
  '00000000-0000-4000-8000-000000003a01',
  'circle',
  -33.9249,
  18.4241,
  10
)
on conflict (id) do update
set shape = excluded.shape,
    center_lat = excluded.center_lat,
    center_lng = excluded.center_lng,
    radius_m = excluded.radius_m;

update public.venues
set geofence_id = '00000000-0000-4000-8000-000000003a01'
where id = '00000000-0000-4000-8000-000000002a01';

create function pg_temp.new_session(p_status text default 'ongoing') returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.class_sessions (
    course_id, lecturer_id, venue_id, scheduled_start, scheduled_end, status
  ) values (
    '00000000-0000-4000-8000-000000001a01',
    '00000000-0000-4000-8000-000000000a02',
    '00000000-0000-4000-8000-000000002a01',
    now(),
    now() + interval '1 hour',
    p_status
  )
  returning id into v_id;
  return v_id;
end;
$$;

do $$
declare
  v_student   uuid := '00000000-0000-4000-8000-000000000a01';
  v_other     uuid := '00000000-0000-4000-8000-000000000a05';
  v_owner     uuid := '00000000-0000-4000-8000-000000000a02';
  v_other_lec uuid := '00000000-0000-4000-8000-000000000a03';
  v_admin     uuid := '00000000-0000-4000-8000-000000000a04';
  v_session   uuid;
  v_sched     uuid;
  v_completed uuid;
  v_cancelled uuid;
  v_row       record;
  v_result    jsonb;
  v_flag      boolean;
  v_count     int;
  v_audit_id  uuid;
begin
  -- -------------------------------------------------------------------
  -- Setup: ongoing, scheduled, completed, cancelled sessions.
  -- -------------------------------------------------------------------
  v_session := pg_temp.new_session('ongoing');
  v_sched   := pg_temp.new_session('scheduled');
  v_completed := pg_temp.new_session('completed');
  v_cancelled := pg_temp.new_session('cancelled');

  -- -------------------------------------------------------------------
  -- 1. Lecturer who owns the session can list enrolled students.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );
  select count(*) into v_count
  from public.get_session_enrolled_students(v_session);
  if v_count <> 1 then
    raise exception 'FAIL: owner should see 1 enrolled student, got %', v_count;
  end if;

  select student_id, full_name, registration_number, checked_in
  into v_row
  from public.get_session_enrolled_students(v_session)
  limit 1;
  if v_row.student_id <> v_student
     or v_row.full_name <> 'Manual Student'
     or v_row.registration_number <> 'MAN-001'
     or v_row.checked_in <> false then
    raise exception 'FAIL: enrolled student row wrong: %, %, %, %',
      v_row.student_id, v_row.full_name, v_row.registration_number, v_row.checked_in;
  end if;

  -- -------------------------------------------------------------------
  -- 2. Lecturer marks the student present.
  -- -------------------------------------------------------------------
  v_result := public.lecturer_mark_present(v_session, v_student);
  if v_result ->> 'status' <> 'present'
     or v_result ->> 'method' <> 'manual'
     or v_result ->> 'record_id' is null then
    raise exception 'FAIL: mark present result wrong: %', v_result;
  end if;

  -- -------------------------------------------------------------------
  -- 3. Student now shows checked_in = true in the list.
  -- -------------------------------------------------------------------
  select checked_in into v_row.checked_in
  from public.get_session_enrolled_students(v_session)
  where student_id = v_student;
  if v_row.checked_in <> true then
    raise exception 'FAIL: checked_in should be true after manual mark';
  end if;

  -- -------------------------------------------------------------------
  -- 4. Marking the same student twice raises 'already recorded'.
  -- -------------------------------------------------------------------
  begin
    perform public.lecturer_mark_present(v_session, v_student);
    raise exception 'FAIL: duplicate manual mark accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%already recorded%' then
      raise exception 'FAIL: wrong error %', sqlerrm;
    end if;
  end;

  -- -------------------------------------------------------------------
  -- 5. Another lecturer cannot list or mark.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other_lec, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.get_session_enrolled_students(v_session);
    raise exception 'FAIL: other lecturer list accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform public.lecturer_mark_present(v_session, v_student);
    raise exception 'FAIL: other lecturer mark accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- -------------------------------------------------------------------
  -- 6. Student cannot call either function.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_student, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.get_session_enrolled_students(v_session);
    raise exception 'FAIL: student list accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform public.lecturer_mark_present(v_session, v_student);
    raise exception 'FAIL: student mark accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- -------------------------------------------------------------------
  -- 7. Admin cannot call either function.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.get_session_enrolled_students(v_session);
    raise exception 'FAIL: admin list accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform public.lecturer_mark_present(v_session, v_student);
    raise exception 'FAIL: admin mark accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- -------------------------------------------------------------------
  -- 8. Cannot mark in scheduled/completed/cancelled sessions.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner, 'role', 'authenticated')::text,
    true
  );
  foreach v_session in array [v_sched, v_completed, v_cancelled] loop
    begin
      perform public.lecturer_mark_present(v_session, v_student);
      raise exception 'FAIL: mark in % session accepted', v_session;
    exception when others then
      if sqlerrm like 'FAIL:%' then raise; end if;
      if sqlerrm not like '%Session is not open for check-in%' then
        raise exception 'FAIL: wrong error for % session: %', v_session, sqlerrm;
      end if;
    end;
  end loop;

  -- -------------------------------------------------------------------
  -- 9. Cannot mark a student not enrolled in the course.
  -- -------------------------------------------------------------------
  begin
    perform public.lecturer_mark_present(v_session, v_other);
    raise exception 'FAIL: mark unenrolled student accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%Student is not enrolled in this course%' then
      raise exception 'FAIL: wrong error %', sqlerrm;
    end if;
  end;

  -- -------------------------------------------------------------------
  -- 10. Audit row written with no student identifiers in metadata.
  -- -------------------------------------------------------------------
  select id into v_audit_id
  from public.audit_logs
  where action = 'attendance.manual_marked'
    and entity_type = 'attendance_records'
    and user_id = v_owner
  order by created_at desc
  limit 1;
  if v_audit_id is null then
    raise exception 'FAIL: no audit row for manual mark';
  end if;

  -- Check metadata contains session_id but not student id/name/number.
  select metadata ->> 'session_id' is not null
  into v_flag
  from public.audit_logs where id = v_audit_id;
  if not v_flag then
    raise exception 'FAIL: audit metadata missing session_id';
  end if;

  select (metadata::text) like '%"student_id"%'
  into v_flag
  from public.audit_logs where id = v_audit_id;
  if v_flag then
    raise exception 'FAIL: audit metadata contains student_id';
  end if;

  select (metadata::text) like '%MAN-001%' or (metadata::text) like '%Manual Student%'
  into v_flag
  from public.audit_logs where id = v_audit_id;
  if v_flag then
    raise exception 'FAIL: audit metadata contains student identifiers';
  end if;

  -- -------------------------------------------------------------------
  -- 11. Student-callable 8-arg RPC rejects 'manual', still accepts 'otp'.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_student, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.check_in_attendance(
      v_session, v_student, null, 'manual', null, -33.9249, 18.4241, 5
    );
    raise exception 'FAIL: student manual 8-arg accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%manual_not_allowed%' then
      raise exception 'FAIL: wrong error %', sqlerrm;
    end if;
  end;

  -- OTP still works (consent not required for non-face).
  v_result := public.check_in_attendance(
    v_session, v_student, null, 'otp', 1.0, -33.9249, 18.4241, 5
  );
  if v_result is null then
    raise exception 'FAIL: student OTP 8-arg returned null';
  end if;

  -- -------------------------------------------------------------------
  -- 12. get_session_attendance and get_register_data show manual mark.
  -- -------------------------------------------------------------------
  select count(*) into v_count
  from public.get_session_attendance(v_session)
  where student_id = v_student and method = 'manual' and status = 'present';
  if v_count <> 1 then
    raise exception 'FAIL: roster does not show manual mark (% rows)', v_count;
  end if;

end;
$$;

rollback;
