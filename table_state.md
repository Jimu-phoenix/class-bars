## Table `profiles`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `full_name` | `text` |  |
| `role` | `user_role` |  |
| `student_number` | `text` |  Nullable Unique |
| `phone_number` | `text` |  Nullable |
| `consent_given_at` | `timestamptz` |  Nullable |
| `consent_version` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `courses`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `course_code` | `text` |  Unique |
| `course_name` | `text` |  |
| `department` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `lecturer_id` | `uuid` |  Nullable |

## Table `venues`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `name` | `text` |  |
| `building` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |
| `geofence_id` | `uuid` |  Nullable |

## Table `class_sessions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `course_id` | `uuid` |  |
| `lecturer_id` | `uuid` |  |
| `venue_id` | `uuid` |  |
| `scheduled_start` | `timestamptz` |  |
| `scheduled_end` | `timestamptz` |  |
| `actual_start` | `timestamptz` |  Nullable |
| `actual_end` | `timestamptz` |  Nullable |
| `status` | `session_status` |  |
| `created_at` | `timestamptz` |  |

## Table `enrollments`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `student_id` | `uuid` |  |
| `course_id` | `uuid` |  |
| `academic_year` | `text` |  |
| `semester` | `text` |  |
| `created_at` | `timestamptz` |  |

## Table `face_embeddings`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `embedding_json` | `text` |  |
| `model_version` | `text` |  |
| `is_active` | `bool` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `attendance_records`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `session_id` | `uuid` |  |
| `student_id` | `uuid` |  |
| `method` | `attendance_method` |  |
| `status` | `attendance_status` |  |
| `check_in_time` | `timestamptz` |  |
| `confidence_score` | `numeric` |  Nullable |
| `created_at` | `timestamptz` |  |
| `flag_reason` | `text` |  Nullable |
| `location_distance_m` | `numeric` |  Nullable |
| `location_accuracy_m` | `numeric` |  Nullable |
| `match_distance` | `float8` |  Nullable |
| `match_score` | `numeric` |  Nullable |
| `match_band` | `text` |  Nullable |
| `match_config_version` | `text` |  Nullable |

## Table `otp_codes`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `session_id` | `uuid` |  Nullable |
| `code_hash` | `text` |  |
| `purpose` | `otp_purpose` |  |
| `attempts` | `int4` |  |
| `expires_at` | `timestamptz` |  |
| `used_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `audit_logs`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  Nullable |
| `action` | `text` |  |
| `entity_type` | `text` |  |
| `entity_id` | `uuid` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `ip_address` | `inet` |  Nullable |
| `user_agent` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `sandbox_sessions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `lecturer_id` | `uuid` |  |
| `class_label` | `text` |  |
| `course_label` | `text` |  |
| `venue_label` | `text` |  |
| `status` | `sandbox_session_status` |  |
| `started_at` | `timestamptz` |  |
| `ended_at` | `timestamptz` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `sandbox_checkins`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `session_id` | `uuid` |  |
| `participant_id` | `uuid` |  |
| `display_name` | `text` |  |
| `embedding` | `text` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `sandbox_participants`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `participant_id` | `uuid` | Primary |
| `display_name` | `text` |  |
| `embedding` | `text` |  |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `staff_email_domains`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `domain` | `text` | Primary |
| `created_at` | `timestamptz` |  |

## Table `admin_login_events`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `email` | `text` |  Nullable |
| `event_type` | `text` |  |
| `ip_address` | `inet` |  Nullable |
| `user_agent` | `text` |  Nullable |
| `metadata` | `jsonb` |  Nullable |
| `created_at` | `timestamptz` |  |

## Table `staff_emails`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `email` | `text` | Primary |
| `created_at` | `timestamptz` |  |

## Table `geofences`

One fence per venue: a circle (centre + radius) or a four-corner class box.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `shape` | `text` |  |
| `center_lat` | `float8` |  Nullable |
| `center_lng` | `float8` |  Nullable |
| `radius_m` | `numeric` |  Nullable |
| `c1_lat` | `float8` |  Nullable |
| `c1_lng` | `float8` |  Nullable |
| `c2_lat` | `float8` |  Nullable |
| `c2_lng` | `float8` |  Nullable |
| `c3_lat` | `float8` |  Nullable |
| `c3_lng` | `float8` |  Nullable |
| `c4_lat` | `float8` |  Nullable |
| `c4_lng` | `float8` |  Nullable |
| `created_at` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |
| `created_by` | `uuid` |  Nullable |

## Table `sandbox_checkins_zero_backup`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` |  Nullable |
| `session_id` | `uuid` |  Nullable |
| `participant_id` | `uuid` |  Nullable |
| `display_name` | `text` |  Nullable |
| `embedding` | `text` |  Nullable |
| `created_at` | `timestamptz` |  Nullable |

## Table `admin_sessions`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `session_id` | `text` |  |
| `issued_at` | `timestamptz` |  |
| `expires_at` | `timestamptz` |  |
| `last_seen_at` | `timestamptz` |  |
| `revoked_at` | `timestamptz` |  Nullable |
| `ip_address` | `inet` |  Nullable |
| `user_agent` | `text` |  Nullable |

## Table `face_match_config`

Single-row calibration for the server-side face match score.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `singleton` | `bool` | Primary |
| `config_revision` | `int8` |  |
| `model_version` | `text` |  |
| `a` | `numeric` |  |
| `b` | `numeric` |  |
| `accept_score` | `numeric` |  |
| `review_score` | `numeric` |  |
| `source_note` | `text` |  |
| `effective_from` | `timestamptz` |  |
| `updated_at` | `timestamptz` |  |

## Table `attendance_pdfs`

Verification codes for lecturer attendance-register PDFs. One row per issued code. `course_id` is nullable (`ON DELETE SET NULL`) so a verified PDF stays verifiable if its course is later deleted. RLS enabled with no policies; all table privileges revoked — access goes through `record_attendance_pdf` and `verify_attendance_pdf` only.

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary, default `gen_random_uuid()` |
| `course_id` | `uuid` | Nullable, references `public.courses(id)` `ON DELETE SET NULL` |
| `pdf_code` | `text` | Not null, Unique, CHECK `^[A-HJ-NP-Z2-9]{6}$` |
| `created_at` | `timestamptz` | Not null, default `now()` |

## Custom Types / Enums

### `user_role`

`student` | `lecturer` | `admin`

### `attendance_method`

`face` | `otp` | `manual`

### `attendance_status`

`present` | `late` | `absent` | `flagged`

### `session_status`

`scheduled` | `ongoing` | `completed` | `cancelled`

### `otp_purpose`

`attendance_fallback` | `login_verification`

### `sandbox_session_status`

`live` | `ended`

## RLS Policies

### `face_embeddings`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Students view own embedding` | SELECT | public | PERMISSIVE | `(auth.uid() = user_id)` | — |
| `Students insert own embedding` | INSERT | public | PERMISSIVE | — | `(auth.uid() = user_id)` |

### `attendance_records`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Students view own attendance` | SELECT | public | PERMISSIVE | `(auth.uid() = student_id)` | — |
| `Lecturers view their session attendance` | SELECT | public | PERMISSIVE | `(EXISTS ( SELECT 1    FROM class_sessions cs   WHERE ((cs.id = attendance_records.session_id) AND (cs.lecturer_id = auth.uid()))))` | — |

### `class_sessions`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Enrolled students view their sessions` | SELECT | public | PERMISSIVE | `((EXISTS ( SELECT 1    FROM enrollments e   WHERE ((e.course_id = class_sessions.course_id) AND (e.student_id = auth.uid())))) OR (lecturer_id = auth.uid()))` | — |
| `Lecturers create own sessions` | INSERT | public | PERMISSIVE | — | `((lecturer_id = auth.uid()) AND is_staff())` |
| `Lecturers update own sessions` | UPDATE | public | PERMISSIVE | `(lecturer_id = auth.uid())` | `(lecturer_id = auth.uid())` |

### `otp_codes`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Users view own otp codes` | SELECT | public | PERMISSIVE | `(auth.uid() = user_id)` | — |

### `staff_email_domains`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Staff domains readable by everyone` | SELECT | public | PERMISSIVE | `true` | — |
| `Admins manage staff_email_domains` | ALL | public | PERMISSIVE | `is_admin_session()` | `is_admin_session()` |

### `courses`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Authenticated users view courses` | SELECT | public | PERMISSIVE | `(auth.role() = 'authenticated'::text)` | — |
| `Staff create courses` | INSERT | public | PERMISSIVE | — | `((lecturer_id = auth.uid()) AND is_staff())` |
| `Staff update courses` | UPDATE | public | PERMISSIVE | `(is_staff() AND ((lecturer_id = auth.uid()) OR (EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))))` | `(is_staff() AND ((lecturer_id = auth.uid()) OR (EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))))` |
| `Admins manage courses` | ALL | public | PERMISSIVE | `is_admin_user()` | `is_admin_user()` |

### `venues`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Authenticated users view venues` | SELECT | public | PERMISSIVE | `(auth.role() = 'authenticated'::text)` | — |
| `Staff create venues` | INSERT | public | PERMISSIVE | — | `is_staff()` |
| `Admins insert venues` | INSERT | public | RESTRICTIVE | — | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::user_role))))` |
| `Admins update venues` | UPDATE | public | RESTRICTIVE | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::user_role))))` | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::user_role))))` |
| `Admins delete venues` | DELETE | public | RESTRICTIVE | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::user_role))))` | — |
| `Admins manage venues` | ALL | public | PERMISSIVE | `is_admin_user()` | `is_admin_user()` |

### `enrollments`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Students view own enrollments` | SELECT | public | PERMISSIVE | `(student_id = auth.uid())` | — |
| `Lecturers view course enrollments` | SELECT | public | PERMISSIVE | `((EXISTS ( SELECT 1    FROM courses c   WHERE ((c.id = enrollments.course_id) AND (c.lecturer_id = auth.uid())))) OR is_admin_user())` | — |

### `admin_sessions`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Admins update own admin_sessions` | UPDATE | public | PERMISSIVE | `(auth.uid() = user_id)` | — |
| `Admins insert own admin_sessions` | INSERT | public | PERMISSIVE | — | `((auth.uid() = user_id) AND (EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))))` |
| `Admins read own admin_sessions` | SELECT | public | PERMISSIVE | `(auth.uid() = user_id)` | — |

### `sandbox_sessions`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Authenticated users view sandbox sessions` | SELECT | public | PERMISSIVE | `(auth.role() = 'authenticated'::text)` | — |
| `Lecturers start own sandbox sessions` | INSERT | public | PERMISSIVE | — | `(lecturer_id = auth.uid())` |
| `Lecturers update own sandbox sessions` | UPDATE | public | PERMISSIVE | `(lecturer_id = auth.uid())` | `(lecturer_id = auth.uid())` |
| `Authenticated users reset sandbox sessions` | DELETE | public | PERMISSIVE | `(auth.role() = 'authenticated'::text)` | — |

### `sandbox_checkins`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Authenticated users view sandbox checkins` | SELECT | public | PERMISSIVE | `(auth.role() = 'authenticated'::text)` | — |
| `Students check in as themselves` | INSERT | public | PERMISSIVE | — | `(participant_id = auth.uid())` |
| `Authenticated users reset sandbox checkins` | DELETE | public | PERMISSIVE | `(auth.role() = 'authenticated'::text)` | — |

### `sandbox_participants`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Participant views own profile` | SELECT | public | PERMISSIVE | `(participant_id = auth.uid())` | — |
| `Participant inserts own profile` | INSERT | public | PERMISSIVE | — | `(participant_id = auth.uid())` |
| `Participant updates own profile` | UPDATE | public | PERMISSIVE | `(participant_id = auth.uid())` | `(participant_id = auth.uid())` |
| `Authenticated users reset participants` | DELETE | public | PERMISSIVE | `(auth.role() = 'authenticated'::text)` | — |

### `staff_emails`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Staff emails readable by everyone` | SELECT | public | PERMISSIVE | `true` | — |
| `Admins insert staff emails` | INSERT | public | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))` |
| `Admins delete staff emails` | DELETE | public | PERMISSIVE | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))` | — |

### `geofences`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Admins read geofences` | SELECT | public | PERMISSIVE | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::user_role))))` | — |
| `Admins insert geofences` | INSERT | public | PERMISSIVE | — | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::user_role))))` |
| `Admins update geofences` | UPDATE | public | PERMISSIVE | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::user_role))))` | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::user_role))))` |
| `Admins delete geofences` | DELETE | public | PERMISSIVE | `(EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::user_role))))` | — |

### `profiles`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Users view own profile` | SELECT | public | PERMISSIVE | `(auth.uid() = id)` | — |
| `Users update own profile` | UPDATE | public | PERMISSIVE | `(auth.uid() = id)` | — |
| `Users insert own profile` | INSERT | public | PERMISSIVE | — | `((auth.uid() = id) AND (COALESCE(role, 'student'::user_role) = 'student'::user_role))` |
| `Admins view all profiles` | SELECT | public | PERMISSIVE | `is_admin_user()` | — |
| `Admins update all profiles` | UPDATE | public | PERMISSIVE | `is_admin_user()` | — |
| `Admins insert profiles` | INSERT | public | PERMISSIVE | — | `is_admin_user()` |
| `Lecturers view enrolled students` | SELECT | public | PERMISSIVE | `(is_lecturer_user() AND (EXISTS ( SELECT 1    FROM (enrollments e      JOIN courses c ON ((c.id = e.course_id)))   WHERE ((e.student_id = profiles.id) AND (c.lecturer_id = auth.uid())))))` | — |

**Trigger:** `trg_protect_profiles_consent` (BEFORE UPDATE, for each row) → `public.protect_profiles_consent()`. Raises if `consent_given_at` or `consent_version` changed and `current_user IN ('authenticated', 'anon')`; SECURITY DEFINER RPCs pass.

### `audit_logs`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Admins view audit_logs` | SELECT | public | PERMISSIVE | `is_admin_user()` | — |

**Note:** `audit_logs.user_id` is nullable with no FK. `delete_my_account()` sets `user_id = NULL` for the deleted user's existing rows; the deletion audit row itself carries no user reference.

### New RPCs (migration 34)

| Function | Returns | Security | Grants |
|----------|---------|----------|--------|
| `public.record_consent(p_version text)` | `void` | SECURITY DEFINER | EXECUTE to authenticated |
| `public.delete_my_account()` | `void` | SECURITY DEFINER | EXECUTE to authenticated |

### Modified RPCs (migration 34)

| Function | Change |
|----------|--------|
| `public.upsert_face_embedding(jsonb, text)` | Raises `consent_required` when `profiles.consent_given_at IS NULL` |
| `public._check_in_attendance(...)` | Raises `consent_required` when `p_method = 'face'` and `consent_given_at IS NULL`; raises `manual_not_allowed` when `p_method = 'manual'` |
| `public.check_in_attendance(uuid, uuid, uuid, attendance_method, numeric, double precision, double precision, double precision)` | Raises `manual_not_allowed` when `p_method = 'manual'` |

### New RPCs (migration 35)

| Function | Returns | Security | Grants |
|----------|---------|----------|--------|
| `public.get_session_enrolled_students(p_session_id uuid)` | `table(student_id, full_name, registration_number, checked_in)` | SECURITY DEFINER | EXECUTE to authenticated |
| `public.lecturer_mark_present(p_session_id uuid, p_student_id uuid)` | `jsonb` | SECURITY DEFINER | EXECUTE to authenticated |

### `face_match_config`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Admin users read face match config` | SELECT | authenticated | PERMISSIVE | `is_admin_user()` | — |

### New RPCs (migration 36)

| Function | Returns | Security | Grants |
|----------|---------|----------|--------|
| `public.get_lecturer_sessions(p_course_id uuid, p_limit int, p_offset int)` | `table(session_id, course_id, course_code, course_name, venue_name, scheduled_start, actual_start, status, checked_in_count, total_count)` | STABLE SECURITY DEFINER | EXECUTE to authenticated |
| `public.search_my_students(p_query text, p_limit int)` | `table(student_id, full_name, registration_number)` | STABLE SECURITY DEFINER | EXECUTE to authenticated |
| `public.get_student_history_for_lecturer(p_student_id uuid, p_course_id uuid)` | `table(session_id, course_id, course_code, course_name, session_start, session_status, result, method)` | STABLE SECURITY DEFINER | EXECUTE to authenticated |
| `public.get_my_history(p_course_id uuid)` | `table(session_id, session_start, session_status, result)` | STABLE SECURITY DEFINER | EXECUTE to authenticated |
| `public.get_student_header_for_lecturer(p_student_id uuid)` | `table(student_id, full_name, registration_number)` | STABLE SECURITY DEFINER | EXECUTE to authenticated |
| `public.list_my_students()` | `table(student_id, full_name, registration_number, course_codes)` | STABLE SECURITY DEFINER | EXECUTE to authenticated |

### New RPCs (migration 37)

| Function | Returns | Security | Grants |
|----------|---------|----------|--------|
| `public.record_attendance_pdf(p_course_id uuid, p_pdf_code text)` | `table(id uuid, created_at timestamptz)` | STABLE SECURITY DEFINER | EXECUTE to authenticated |
| `public.verify_attendance_pdf(p_code text)` | `table(course_code text, course_name text, created_at timestamptz)` | STABLE SECURITY DEFINER | EXECUTE to anon, authenticated |

All six are lecturer-only (`is_lecturer_user()`), revoked from `public`/`anon`, granted `EXECUTE` to `authenticated`, run with a fixed `search_path` and `lock_timeout`/`statement_timeout`. None of them expose `flag_reason`, `match_score`, `match_band`, `match_distance`, `location_distance_m`, `location_accuracy_m` or `confidence_score`.


