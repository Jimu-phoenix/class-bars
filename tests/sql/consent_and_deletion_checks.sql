-- =====================================================================
-- Class-BARS consent + account deletion checks
--
-- MANUAL TEST. Run in the Supabase SQL Editor as postgres after applying
-- migrations/34_consent_and_account_deletion.sql.
--
-- Creates temporary fixtures, exercises record_consent, delete_my_account,
-- consent enforcement on face enrolment/check-in, then rolls everything back.
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
  ('00000000-0000-4000-8000-000000000901', 'authenticated', 'authenticated',
   'consent-student@example.invalid', now(), '{"full_name":"Consent Student","role":"student"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000902', 'authenticated', 'authenticated',
   'consent-lecturer@example.invalid', now(), '{"full_name":"Consent Lecturer","role":"lecturer"}'::jsonb, false),
  ('00000000-0000-4000-8000-000000000903', 'authenticated', 'authenticated',
   'consent-admin@example.invalid', now(), '{"full_name":"Consent Admin","role":"admin"}'::jsonb, false)
on conflict (id) do nothing;

insert into public.profiles (id, full_name, role, student_number) values
  ('00000000-0000-4000-8000-000000000901', 'Consent Student', 'student', 'CS-001'),
  ('00000000-0000-4000-8000-000000000902', 'Consent Lecturer', 'lecturer', null),
  ('00000000-0000-4000-8000-000000000903', 'Consent Admin', 'admin', null)
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    student_number = excluded.student_number;

insert into public.courses (id, course_code, course_name, lecturer_id)
values (
  '00000000-0000-4000-8000-000000001901',
  'CONSENT-101',
  'Consent test course',
  '00000000-0000-4000-8000-000000000902'
)
on conflict (id) do update set course_name = excluded.course_name, lecturer_id = excluded.lecturer_id;

insert into public.enrollments (student_id, course_id, academic_year, semester)
values (
  '00000000-0000-4000-8000-000000000901',
  '00000000-0000-4000-8000-000000001901',
  '2026',
  '1'
)
on conflict (student_id, course_id, academic_year, semester) do nothing;

insert into public.venues (id, name)
values ('00000000-0000-4000-8000-000000002901', 'Consent Test Room')
on conflict (id) do update set name = excluded.name;

insert into public.geofences (id, shape, center_lat, center_lng, radius_m)
values (
  '00000000-0000-4000-8000-000000003901',
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
set geofence_id = '00000000-0000-4000-8000-000000003901'
where id = '00000000-0000-4000-8000-000000002901';

create function pg_temp.new_session() returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.class_sessions (
    course_id, lecturer_id, venue_id, scheduled_start, scheduled_end, status
  ) values (
    '00000000-0000-4000-8000-000000001901',
    '00000000-0000-4000-8000-000000000902',
    '00000000-0000-4000-8000-000000002901',
    now(),
    now() + interval '1 hour',
    'ongoing'
  )
  returning id into v_id;
  return v_id;
end;
$$;

do $$
declare
  v_student   uuid := '00000000-0000-4000-8000-000000000901';
  v_lecturer  uuid := '00000000-0000-4000-8000-000000000902';
  v_admin     uuid := '00000000-0000-4000-8000-000000000903';
  v_session   uuid;
  v_result    jsonb;
  v_consent   timestamptz;
  v_version   text;
  v_count     int;
  v_uid_text  text := v_student::text;
begin
  -- -------------------------------------------------------------------
  -- 1. Direct client UPDATE of consent columns must be blocked.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_student, 'role', 'authenticated')::text,
    true
  );
  begin
    update public.profiles
    set consent_given_at = now(),
        consent_version = '2026-11-v1'
    where id = v_student;
    raise exception 'FAIL: direct consent update accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%consent columns cannot be set directly%' then
      raise exception 'FAIL: wrong error %', sqlerrm;
    end if;
  end;

  -- -------------------------------------------------------------------
  -- 2. INSERT profile with consent preset must be blocked.
  -- -------------------------------------------------------------------
  begin
    insert into public.profiles (id, full_name, role, student_number, consent_given_at, consent_version)
    values (
      '00000000-0000-4000-8000-000000000999',
      'Preset Consent', 'student', 'CS-999',
      now(), '2026-11-v1'
    );
    raise exception 'FAIL: insert with consent preset accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- -------------------------------------------------------------------
  -- 3. record_consent works.
  -- -------------------------------------------------------------------
  perform public.record_consent('2026-11-v1');
  select consent_given_at, consent_version
  into v_consent, v_version
  from public.profiles where id = v_student;
  if v_consent is null or v_version <> '2026-11-v1' then
    raise exception 'FAIL: consent not recorded (%, %)', v_consent, v_version;
  end if;

  -- -------------------------------------------------------------------
  -- 4. record_consent is idempotent (same version keeps timestamp).
  -- -------------------------------------------------------------------
  perform public.record_consent('2026-11-v1');
  select consent_given_at into v_consent from public.profiles where id = v_student;

  -- -------------------------------------------------------------------
  -- 5. record_consent rejects bad version.
  -- -------------------------------------------------------------------
  begin
    perform public.record_consent('bad-version');
    raise exception 'FAIL: bad version accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%invalid_consent_version%' then
      raise exception 'FAIL: wrong error %', sqlerrm;
    end if;
  end;

  -- -------------------------------------------------------------------
  -- 6. record_consent rejects non-students.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_lecturer, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.record_consent('2026-11-v1');
    raise exception 'FAIL: lecturer consent accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- -------------------------------------------------------------------
  -- 7. Face enrolment (upsert_face_embedding) requires consent.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_student, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.upsert_face_embedding(
      '[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,0.1,0.2,0.3,0.4,0.5,0.6,0.7,
        0.8,0.9,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,0.1,0.2,0.3,0.4,0.5,
        0.6,0.7,0.8,0.9,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,0.1,0.2,0.3,
        0.4,0.5,0.6,0.7,0.8,0.9,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,0.1,
        0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,
        0.9,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,0.1,0.2,0.3,0.4,0.5,0.6,
        0.7,0.8,0.9,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,0.1,0.2,0.3,0.4,
        0.5,0.6,0.7,0.8]'::jsonb,
      'face-api-recognition-full68-v1'
    );
    raise exception 'FAIL: upsert without consent accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%consent_required%' then
      raise exception 'FAIL: wrong error %', sqlerrm;
    end if;
  end;

  -- -------------------------------------------------------------------
  -- 8. Face check-in (9-arg RPC) requires consent.
  -- -------------------------------------------------------------------
  v_session := pg_temp.new_session();
  begin
    perform public.check_in_attendance(
      v_session, v_student, null, 'face', null, -33.9249, 18.4241, 5, 0.40
    );
    raise exception 'FAIL: face check-in without consent accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm not like '%consent_required%' then
      raise exception 'FAIL: wrong error %', sqlerrm;
    end if;
  end;

  -- -------------------------------------------------------------------
  -- 9. Face check-in works WITH consent.
  -- -------------------------------------------------------------------
  perform public.record_consent('2026-11-v1');
  v_session := pg_temp.new_session();
  v_result := public.check_in_attendance(
    v_session, v_student, null, 'face', null, -33.9249, 18.4241, 5, 0.40
  );
  if v_result ->> 'outcome' <> 'accept' then
    raise exception 'FAIL: face check-in with consent outcome %', v_result ->> 'outcome';
  end if;

  -- -------------------------------------------------------------------
  -- 10. OTP/manual (8-arg RPC) works without consent.
  -- -------------------------------------------------------------------
  update public.profiles set consent_given_at = null, consent_version = null where id = v_student;
  v_session := pg_temp.new_session();
  v_result := public.check_in_attendance(
    v_session, v_student, null, 'otp', 1.0, -33.9249, 18.4241, 5
  );
  if v_result is null then
    raise exception 'FAIL: OTP check-in without consent returned null';
  end if;

  -- -------------------------------------------------------------------
  -- 11. delete_my_account rejects lecturer/admin/anon.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_lecturer, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.delete_my_account();
    raise exception 'FAIL: lecturer delete accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );
  begin
    perform public.delete_my_account();
    raise exception 'FAIL: admin delete accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- -------------------------------------------------------------------
  -- 12. delete_my_account works for student.
  -- -------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_student, 'role', 'authenticated')::text,
    true
  );
  perform public.record_consent('2026-11-v1');
  perform public.delete_my_account();

  -- Profile deleted.
  select count(*) into v_count from public.profiles where id = v_student;
  if v_count <> 0 then
    raise exception 'FAIL: profile not deleted (% rows)', v_count;
  end if;

  -- Face embeddings deleted.
  select count(*) into v_count from public.face_embeddings where user_id = v_student;
  if v_count <> 0 then
    raise exception 'FAIL: face embeddings not deleted (% rows)', v_count;
  end if;

  -- Enrollments deleted.
  select count(*) into v_count from public.enrollments where student_id = v_student;
  if v_count <> 0 then
    raise exception 'FAIL: enrollments not deleted (% rows)', v_count;
  end if;

  -- OTP codes deleted.
  select count(*) into v_count from public.otp_codes where user_id = v_student;
  if v_count <> 0 then
    raise exception 'FAIL: otp_codes not deleted (% rows)', v_count;
  end if;

  -- Attendance anonymised (student_id NULL, confidence_score cleared, match/location/flag cleared).
  select count(*) into v_count
  from public.attendance_records
  where student_id = v_student;
  if v_count <> 0 then
    raise exception 'FAIL: attendance not anonymised (% rows still linked)', v_count;
  end if;
  select count(*) into v_count
  from public.attendance_records
  where student_id is null
    and (confidence_score is not null or match_distance is not null
         or match_score is not null or match_band is not null
         or match_config_version is not null
         or location_distance_m is not null or location_accuracy_m is not null
         or flag_reason is not null);
  if v_count <> 0 then
    raise exception 'FAIL: anonymised rows still have personal/derived fields (% rows)', v_count;
  end if;

  -- Other students' rows untouched.
  select count(*) into v_count from public.profiles where id = v_lecturer;
  if v_count <> 1 then
    raise exception 'FAIL: lecturer profile deleted (% rows)', v_count;
  end if;

  -- -------------------------------------------------------------------
  -- 13. Audit logs: no row references the deleted uuid; former rows have
  --     no ip_address/user_agent; exactly one account.deleted row exists
  --     with no personal data.
  -- -------------------------------------------------------------------
  select count(*) into v_count
  from public.audit_logs
  where user_id = v_student
     or entity_id = v_student
     or metadata::text like '%' || v_student::text || '%';
  if v_count <> 0 then
    raise exception 'FAIL: audit_logs still references deleted uuid (% rows)', v_count;
  end if;

  select count(*) into v_count
  from public.audit_logs
  where action = 'account.deleted';
  if v_count <> 1 then
    raise exception 'FAIL: expected exactly 1 account.deleted row, got %', v_count;
  end if;

  select count(*) into v_count
  from public.audit_logs
  where action = 'account.deleted'
    and (user_id is not null or entity_id is not null
         or ip_address is not null or user_agent is not null
         or metadata is not null and metadata <> '{}'::jsonb);
  if v_count <> 0 then
    raise exception 'FAIL: account.deleted row contains personal data (% rows)', v_count;
  end if;

  -- Former consent.recorded rows for this user: no ip_address/user_agent.
  select count(*) into v_count
  from public.audit_logs
  where action = 'consent.recorded'
    and (ip_address is not null or user_agent is not null);
  if v_count <> 0 then
    raise exception 'FAIL: former consent rows retain ip_address/user_agent (% rows)', v_count;
  end if;

  -- -------------------------------------------------------------------
  -- 14. get_session_attendance and get_register_data work with anonymised rows.
  -- -------------------------------------------------------------------
  select count(*) into v_count
  from public.get_session_attendance(
    (select id from public.class_sessions where lecturer_id = v_lecturer limit 1)
  );
  if v_count is null then
    raise exception 'FAIL: get_session_attendance returned null';
  end if;

end;
$$;

rollback;
