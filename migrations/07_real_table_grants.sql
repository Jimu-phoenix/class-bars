-- =====================================================================
-- Class-BARS Migration 07: explicit GRANTs on the real (non-sandbox)
-- tables
--
-- Symptom: "permission denied for table courses / class_sessions" from
-- the app, while sandbox tables work fine.
--
-- Cause: "permission denied" is a MISSING-GRANT error, not an RLS
-- error. PostgreSQL checks the role's table privilege BEFORE evaluating
-- RLS policies: a role with no privilege on a table gets a hard
-- permission-denied, a role with privilege just gets filters applied.
--
-- The base schema (class_bars_schema_no_geo.sql) ships no GRANT
-- statements, so it relied entirely on Supabase's default privileges.
-- Default privileges only apply to objects created AFTER they were set,
-- so any table that already existed (or was created by a migration run
-- under a different owner) keeps ZERO grants. The sandbox tables work
-- because migrations 02/05 granted them explicitly; the real tables
-- never did.
--
-- Re-runnable (idempotent). Run in the SQL Editor as postgres.
-- =====================================================================

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------------------
-- authenticated app users: full DML set. RLS still gates every row and
-- statement (self-only profiles, lecturer-owned sessions, staff writes,
-- self-service enrollments, etc.); these grants merely unblock the
-- privilege gate so the policies get evaluated.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- anon: read-only where it makes sense (no anon rows exist in profiles).
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Client-called RPCs. New functions get EXECUTE for PUBLIC by default,
-- but be explicit so a custom role setup can never silently break them.
-- ---------------------------------------------------------------------
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