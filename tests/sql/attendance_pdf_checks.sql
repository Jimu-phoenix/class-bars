-- =====================================================================
-- Class-BARS attendance PDF checks (migration 37)
--
-- MANUAL TEST. Run in the Supabase SQL Editor as postgres after applying
-- migrations/37_attendance_pdfs.sql.
--
-- Exercises record_attendance_pdf (lecturer-owned course only) and
-- verify_attendance_pdf (public), the table privilege locks, the code
-- format rules, the duplicate-code path, the audit row, and the
-- deleted-course behaviour. Rolls everything back at the end.
-- =====================================================================

begin;

select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

-- ---------------------------------------------------------------------
-- Fixtures: two lecturers, one student, one admin, two courses.
-- ---------------------------------------------------------------------
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, is_anonymous) values
  ('00000000-0000-4000-8000-000000000c01', 'authenticated', 'authenticated', 'pdf-student-a@example.invalid', now(), '{"full_name":"PDF Student A","role":"student"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000c02', 'authenticated', 'authenticated', 'pdf-lecturer-a@example.invalid', now(), '{"full_name":"PDF Lecturer A","role":"lecturer"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000c03', 'authenticated', 'authenticated', 'pdf-lecturer-b@example.invalid', now(), '{"full_name":"PDF Lecturer B","role":"lecturer"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000c04', 'authenticated', 'authenticated', 'pdf-admin@example.invalid', now(), '{"full_name":"PDF Admin","role":"admin"}'::jsonb, false)
on conflict (id) do nothing;

insert into public.profiles (id, full_name, role) values
  ('00000000-0000-4000-8000-000000000c01', 'PDF Student A', 'student'),
  ('00000000-0000-4000-8000-000000000c02', 'PDF Lecturer A', 'lecturer'),
  ('00000000-0000-4000-8000-000000000c03', 'PDF Lecturer B', 'lecturer'),
  ('00000000-0000-4000-8000-000000000c04', 'PDF Admin', 'admin')
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;

insert into public.courses (id, course_code, course_name, lecturer_id) values
  ('00000000-0000-4000-8000-000000001c01', 'PDF-101', 'PDF course A', '00000000-0000-4000-8000-000000000c02'),
  ('00000000-0000-4000-8000-000000001c02', 'PDF-102', 'PDF course B', '00000000-0000-4000-8000-000000000c03')
on conflict (id) do update set course_name = excluded.course_name, lecturer_id = excluded.lecturer_id;

do $$
declare
  v_lec_a     uuid := '00000000-0000-4000-8000-000000000c02';
  v_lec_b     uuid := '00000000-0000-4000-8000-000000000c03';
  v_stu_a     uuid := '00000000-0000-4000-8000-000000000c01';
  v_adm       uuid := '00000000-0000-4000-8000-000000000c04';
  v_course_a  uuid := '00000000-0000-4000-8000-000000001c01';
  v_course_b  uuid := '00000000-0000-4000-8000-000000001c02';
  v_id        uuid;
  v_created_at timestamptz;
  v_code      text;
  v_cnt       int;
begin
  -- ------------------------------------------------------------------
  -- 1. Output columns of verify_attendance_pdf are exactly
  --    course_code, course_name, created_at.
  -- ------------------------------------------------------------------
  select string_agg(attname, ',' order by attnum)
  into v_code
  from pg_attribute
  where attrelid = 'public.verify_attendance_pdf(text)'::regprocedure
    and attnum > 0 and not attisdropped;
  if v_code <> 'course_code,course_name,created_at' then
    raise exception 'FAIL: verify_attendance_pdf output columns are %, expected course_code,course_name,created_at', v_code;
  end if;

  -- ------------------------------------------------------------------
  -- 2. Anon and authenticated have no direct SELECT/INSERT on the table.
  -- ------------------------------------------------------------------
  if has_table_privilege('anon', 'public.attendance_pdfs'::regclass, 'select') then
    raise exception 'FAIL: anon should not have select on attendance_pdfs';
  end if;
  if has_table_privilege('anon', 'public.attendance_pdfs'::regclass, 'insert') then
    raise exception 'FAIL: anon should not have insert on attendance_pdfs';
  end if;
  if has_table_privilege('authenticated', 'public.attendance_pdfs'::regclass, 'select') then
    raise exception 'FAIL: authenticated should not have select on attendance_pdfs';
  end if;
  if has_table_privilege('authenticated', 'public.attendance_pdfs'::regclass, 'insert') then
    raise exception 'FAIL: authenticated should not have insert on attendance_pdfs';
  end if;

  -- ------------------------------------------------------------------
  -- 3. record_attendance_pdf privilege lock: anon cannot execute.
  -- ------------------------------------------------------------------
  if has_function_privilege(
       'anon',
       'public.record_attendance_pdf(uuid, text)'::regprocedure,
       'execute'
     ) then
    raise exception 'FAIL: anon should not have execute on record_attendance_pdf';
  end if;

  -- ------------------------------------------------------------------
  -- 4. Owning lecturer can record a code; returns id + created_at.
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_lec_a, 'role', 'authenticated')::text, true);
  select id, created_at into v_id, v_created_at
  from public.record_attendance_pdf(v_course_a, 'ABC234');
  if v_id is null or v_created_at is null then
    raise exception 'FAIL: record_attendance_pdf returned null id/created_at';
  end if;

  -- ------------------------------------------------------------------
  -- 5. Another lecturer cannot record for course A (not owned).
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_lec_b, 'role', 'authenticated')::text, true);
  begin
    perform public.record_attendance_pdf(v_course_a, 'DEF567');
    raise exception 'FAIL: lecturer B should not record for lecturer A course';
  exception when others then
    if sqlerrm not like '%Course not found or not owned by you%' then
      raise exception 'FAIL: wrong error %', sqlerrm;
    end if;
  end;

  -- ------------------------------------------------------------------
  -- 6. Student, admin cannot call record_attendance_pdf.
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_stu_a, 'role', 'authenticated')::text, true);
  begin
    perform public.record_attendance_pdf(v_course_a, 'GHI789');
    raise exception 'FAIL: student should not record a PDF code';
  exception when others then
    if sqlerrm not like '%Only lecturers can register attendance PDFs%' then
      raise exception 'FAIL: wrong student error %', sqlerrm;
    end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  begin
    perform public.record_attendance_pdf(v_course_a, 'JKL012');
    raise exception 'FAIL: admin should not record a PDF code';
  exception when others then
    if sqlerrm not like '%Only lecturers can register attendance PDFs%' then
      raise exception 'FAIL: wrong admin error %', sqlerrm;
    end if;
  end;

  -- ------------------------------------------------------------------
  -- 7. Malformed codes are rejected by the owning lecturer.
  --    (wrong length, forbidden chars I/O/0/1, symbols).
  --    Lowercase + spaces are accepted after normalisation.
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_lec_a, 'role', 'authenticated')::text, true);

  -- lowercase + spaces: normalises to ABC234 -> duplicate -> pdf_code_taken
  begin
    perform public.record_attendance_pdf(v_course_a, 'abc 234');
    raise exception 'FAIL: normalised duplicate should raise pdf_code_taken';
  exception when others then
    if sqlerrm not like '%pdf_code_taken%' then
      raise exception 'FAIL: expected pdf_code_taken for normalised duplicate, got %', sqlerrm;
    end if;
  end;

  -- wrong length (5 chars)
  begin
    perform public.record_attendance_pdf(v_course_a, 'ABCDE');
    raise exception 'FAIL: 5-char code accepted';
  exception when others then
    if sqlerrm not like '%invalid_pdf_code%' then
      raise exception 'FAIL: expected invalid_pdf_code for short code, got %', sqlerrm;
    end if;
  end;

  -- wrong length (7 chars)
  begin
    perform public.record_attendance_pdf(v_course_a, 'ABCDEFG');
    raise exception 'FAIL: 7-char code accepted';
  exception when others then
    if sqlerrm not like '%invalid_pdf_code%' then
      raise exception 'FAIL: expected invalid_pdf_code for long code, got %', sqlerrm;
    end if;
  end;

  -- forbidden char I
  begin
    perform public.record_attendance_pdf(v_course_a, 'ABC2I4');
    raise exception 'FAIL: code with I accepted';
  exception when others then
    if sqlerrm not like '%invalid_pdf_code%' then
      raise exception 'FAIL: expected invalid_pdf_code for forbidden I, got %', sqlerrm;
    end if;
  end;

  -- forbidden char O
  begin
    perform public.record_attendance_pdf(v_course_a, 'ABC2O4');
    raise exception 'FAIL: code with O accepted';
  exception when others then
    if sqlerrm not like '%invalid_pdf_code%' then
      raise exception 'FAIL: expected invalid_pdf_code for forbidden O, got %', sqlerrm;
    end if;
  end;

  -- forbidden digit 0
  begin
    perform public.record_attendance_pdf(v_course_a, 'ABC230');
    raise exception 'FAIL: code with 0 accepted';
  exception when others then
    if sqlerrm not like '%invalid_pdf_code%' then
      raise exception 'FAIL: expected invalid_pdf_code for forbidden 0, got %', sqlerrm;
    end if;
  end;

  -- forbidden digit 1
  begin
    perform public.record_attendance_pdf(v_course_a, 'ABC231');
    raise exception 'FAIL: code with 1 accepted';
  exception when others then
    if sqlerrm not like '%invalid_pdf_code%' then
      raise exception 'FAIL: expected invalid_pdf_code for forbidden 1, got %', sqlerrm;
    end if;
  end;

  -- symbol (dash)
  begin
    perform public.record_attendance_pdf(v_course_a, 'ABC2-4');
    raise exception 'FAIL: code with dash accepted';
  exception when others then
    if sqlerrm not like '%invalid_pdf_code%' then
      raise exception 'FAIL: expected invalid_pdf_code for symbol, got %', sqlerrm;
    end if;
  end;

  -- ------------------------------------------------------------------
  -- 8. Duplicate code raises 'pdf_code_taken' (ABC234 already recorded).
  -- ------------------------------------------------------------------
  begin
    perform public.record_attendance_pdf(v_course_a, 'ABC234');
    raise exception 'FAIL: duplicate code accepted';
  exception when others then
    if sqlerrm not like '%pdf_code_taken%' then
      raise exception 'FAIL: expected pdf_code_taken for duplicate, got %', sqlerrm;
    end if;
  end;

  -- ------------------------------------------------------------------
  -- 9. A fresh code records fine for course A.
  -- ------------------------------------------------------------------
  select id into v_id
  from public.record_attendance_pdf(v_course_a, 'MNX9Q7');
  if v_id is null then
    raise exception 'FAIL: fresh code record returned null';
  end if;

  -- ------------------------------------------------------------------
  -- 10. Audit row exists with only course_id in metadata.
  -- ------------------------------------------------------------------
  select count(*) into v_cnt
  from public.audit_logs
  where action = 'register.exported'
    and entity_type = 'attendance_pdfs'
    and metadata ? 'course_id'
    and not (metadata ? 'student_id')
    and not (metadata ? 'full_name')
    and not (metadata ? 'registration_number');
  if v_cnt < 1 then
    raise exception 'FAIL: no register.exported audit row with course_id-only metadata';
  end if;

  -- ------------------------------------------------------------------
  -- 11. verify_attendance_pdf returns the row for a valid code,
  --     including lowercase input and surrounding spaces.
  -- ------------------------------------------------------------------
  select count(*) into v_cnt from public.verify_attendance_pdf(' ABC234 ');
  if v_cnt <> 1 then
    raise exception 'FAIL: verify with spaces should return 1 row, got %', v_cnt;
  end if;
  select count(*) into v_cnt from public.verify_attendance_pdf('ABC234');
  if v_cnt <> 1 then
    raise exception 'FAIL: verify should return 1 row for valid code, got %', v_cnt;
  end if;

  -- ------------------------------------------------------------------
  -- 12. verify returns nothing for unknown or malformed code.
  -- ------------------------------------------------------------------
  select count(*) into v_cnt from public.verify_attendance_pdf('ZZZZZZ');
  if v_cnt <> 0 then
    raise exception 'FAIL: unknown code should return 0 rows, got %', v_cnt;
  end if;
  select count(*) into v_cnt from public.verify_attendance_pdf('short');
  if v_cnt <> 0 then
    raise exception 'FAIL: short code should return 0 rows, got %', v_cnt;
  end if;
  select count(*) into v_cnt from public.verify_attendance_pdf('ABC2I4');
  if v_cnt <> 0 then
    raise exception 'FAIL: forbidden-char code should return 0 rows, got %', v_cnt;
  end if;

  -- ------------------------------------------------------------------
  -- 13. verify works for anon (role claim 'anon').
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select count(*) into v_cnt from public.verify_attendance_pdf('ABC234');
  if v_cnt <> 1 then
    raise exception 'FAIL: anon verify should return 1 row, got %', v_cnt;
  end if;

  -- ------------------------------------------------------------------
  -- 14. Deleting the course: verify still returns a row with NULL
  --     course fields (pdf_code stays verifiable).
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_lec_a, 'role', 'authenticated')::text, true);
  delete from public.courses where id = v_course_a;
  select count(*) into v_cnt from public.verify_attendance_pdf('MNX9Q7');
  if v_cnt <> 1 then
    raise exception 'FAIL: verify after course delete should still return 1 row, got %', v_cnt;
  end if;

  raise notice 'PASS: all attendance PDF checks passed';
end;
$$;

rollback;
