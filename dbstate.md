## Table `profiles`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `full_name` | `text` |  |
| `role` | `user_role` |  |
| `student_number` | `text` |  Nullable Unique |
| `staff_number` | `text` |  Nullable Unique |
| `phone_number` | `text` |  Nullable |
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

## Table `devices`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `user_id` | `uuid` |  |
| `device_fingerprint` | `text` |  |
| `device_name` | `text` |  Nullable |
| `is_trusted` | `bool` |  |
| `last_seen_at` | `timestamptz` |  |
| `created_at` | `timestamptz` |  |

## Table `attendance_records`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `session_id` | `uuid` |  |
| `student_id` | `uuid` |  |
| `device_id` | `uuid` |  Nullable |
| `method` | `attendance_method` |  |
| `status` | `attendance_status` |  |
| `check_in_time` | `timestamptz` |  |
| `confidence_score` | `numeric` |  Nullable |
| `created_at` | `timestamptz` |  |

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

## Table `admin_login_otps`

### Columns

| Name | Type | Constraints |
|------|------|-------------|
| `id` | `uuid` | Primary |
| `email` | `text` |  |
| `code_hash` | `text` |  |
| `attempts` | `int4` |  |
| `max_attempts` | `int4` |  |
| `expires_at` | `timestamptz` |  |
| `resend_available_at` | `timestamptz` |  |
| `request_count_window` | `timestamptz` |  Nullable |
| `request_count` | `int4` |  |
| `ip_address` | `inet` |  Nullable |
| `user_agent` | `text` |  Nullable |
| `used_at` | `timestamptz` |  Nullable |
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

### `profiles`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Admins manage profiles` | SELECT | public | PERMISSIVE | `is_admin_session()` | — |
| `Admins update profiles` | UPDATE | public | PERMISSIVE | `is_admin_session()` | `is_admin_session()` |
| `Users insert own profile` | INSERT | public | PERMISSIVE | — | `((auth.uid() = id) AND (COALESCE(role, 'student'::user_role) = 'student'::user_role))` |
| `Users update own profile` | UPDATE | public | PERMISSIVE | `(auth.uid() = id)` | — |
| `Users view own profile` | SELECT | public | PERMISSIVE | `(auth.uid() = id)` | — |

### `courses`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Admins manage courses` | ALL | public | PERMISSIVE | `is_admin_session()` | `is_admin_session()` |
| `Authenticated users view courses` | SELECT | public | PERMISSIVE | `(auth.role() = 'authenticated'::text)` | — |
| `Staff create courses` | INSERT | public | PERMISSIVE | — | `((lecturer_id = auth.uid()) AND is_staff())` |
| `Staff update courses` | UPDATE | public | PERMISSIVE | `(is_staff() AND ((lecturer_id = auth.uid()) OR (EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))))` | `(is_staff() AND ((lecturer_id = auth.uid()) OR (EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))))` |

### `venues`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Admins manage venues` | ALL | public | PERMISSIVE | `is_admin_session()` | `is_admin_session()` |
| `Authenticated users view venues` | SELECT | public | PERMISSIVE | `(auth.role() = 'authenticated'::text)` | — |
| `Staff create venues` | INSERT | public | PERMISSIVE | — | `is_staff()` |

### `class_sessions`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Enrolled students view their sessions` | SELECT | public | PERMISSIVE | `((EXISTS ( SELECT 1    FROM enrollments e   WHERE ((e.course_id = class_sessions.course_id) AND (e.student_id = auth.uid())))) OR (lecturer_id = auth.uid()))` | — |
| `Lecturers create own sessions` | INSERT | public | PERMISSIVE | — | `((lecturer_id = auth.uid()) AND is_staff())` |
| `Lecturers update own sessions` | UPDATE | public | PERMISSIVE | `(lecturer_id = auth.uid())` | `(lecturer_id = auth.uid())` |

### `face_embeddings`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Students insert own embedding` | INSERT | public | PERMISSIVE | — | `(auth.uid() = user_id)` |
| `Students view own embedding` | SELECT | public | PERMISSIVE | `(auth.uid() = user_id)` | — |

### `devices`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Users manage own devices` | ALL | public | PERMISSIVE | `(auth.uid() = user_id)` | `(auth.uid() = user_id)` |

### `attendance_records`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Lecturers view their session attendance` | SELECT | public | PERMISSIVE | `(EXISTS ( SELECT 1    FROM class_sessions cs   WHERE ((cs.id = attendance_records.session_id) AND (cs.lecturer_id = auth.uid()))))` | — |
| `Students insert own attendance` | INSERT | public | PERMISSIVE | — | `(auth.uid() = student_id)` |
| `Students view own attendance` | SELECT | public | PERMISSIVE | `(auth.uid() = student_id)` | — |

### `otp_codes`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Users view own otp codes` | SELECT | public | PERMISSIVE | `(auth.uid() = user_id)` | — |

### `audit_logs`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Admins view audit_logs` | SELECT | public | PERMISSIVE | `is_admin_session()` | — |

### `sandbox_sessions`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Authenticated users reset sandbox sessions` | DELETE | public | PERMISSIVE | `(auth.role() = 'authenticated'::text)` | — |
| `Authenticated users view sandbox sessions` | SELECT | public | PERMISSIVE | `(auth.role() = 'authenticated'::text)` | — |
| `Lecturers start own sandbox sessions` | INSERT | public | PERMISSIVE | — | `(lecturer_id = auth.uid())` |
| `Lecturers update own sandbox sessions` | UPDATE | public | PERMISSIVE | `(lecturer_id = auth.uid())` | `(lecturer_id = auth.uid())` |

### `sandbox_checkins`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Authenticated users reset sandbox checkins` | DELETE | public | PERMISSIVE | `(auth.role() = 'authenticated'::text)` | — |
| `Authenticated users view sandbox checkins` | SELECT | public | PERMISSIVE | `(auth.role() = 'authenticated'::text)` | — |
| `Students check in as themselves` | INSERT | public | PERMISSIVE | — | `(participant_id = auth.uid())` |

### `sandbox_participants`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Authenticated users reset participants` | DELETE | public | PERMISSIVE | `(auth.role() = 'authenticated'::text)` | — |
| `Participant inserts own profile` | INSERT | public | PERMISSIVE | — | `(participant_id = auth.uid())` |
| `Participant updates own profile` | UPDATE | public | PERMISSIVE | `(participant_id = auth.uid())` | `(participant_id = auth.uid())` |
| `Participant views own profile` | SELECT | public | PERMISSIVE | `(participant_id = auth.uid())` | — |

### `staff_email_domains`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Admins manage staff_email_domains` | ALL | public | PERMISSIVE | `is_admin_session()` | `is_admin_session()` |
| `Staff domains readable by everyone` | SELECT | public | PERMISSIVE | `true` | — |

### `enrollments`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Students view own enrollments` | SELECT | public | PERMISSIVE | `(student_id = auth.uid())` | — |

### `admin_sessions`

| Policy | Command | Roles | Action | USING | WITH CHECK |
|--------|---------|-------|--------|-------|------------|
| `Admins insert own admin_sessions` | INSERT | public | PERMISSIVE | — | `((auth.uid() = user_id) AND (EXISTS ( SELECT 1    FROM profiles   WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))))` |
| `Admins read own admin_sessions` | SELECT | public | PERMISSIVE | `(auth.uid() = user_id)` | — |
| `Admins update own admin_sessions` | UPDATE | public | PERMISSIVE | `(auth.uid() = user_id)` | — |

