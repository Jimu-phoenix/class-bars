-- Class-BARS Migration 07: explicit GRANTs on the real (non-sandbox)

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on table
  profiles,
  courses,
  venues,
  class_sessions,
  enrollments,
  face_embeddings,
  devices,
  attendance_records,
  otp_codes,
  audit_logs
  to authenticated;

grant select on table
  courses,
  venues,
  class_sessions,
  enrollments,
  face_embeddings,
  devices,
  attendance_records,
  otp_codes,
  audit_logs
  to anon;

grant execute on function
  public.is_staff(),
  public.check_in_attendance(uuid, uuid, uuid, attendance_method, numeric),
  public.start_session(uuid),
  public.end_session(uuid),
  public.upsert_face_embedding(jsonb, text),
  public.clear_face_embedding(),
  public.enroll_self(text, text, text),
  public.get_session_attendance(uuid)
  to anon, authenticated;