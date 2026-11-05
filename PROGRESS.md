# Class-BARS Progress Report

**Date:** 2026-11-02
**Repo:** `D:\classBars\class-bars`
**Overall status:** Real (DB-backed) attendance flow built end-to-end and verified by lint/build/tests. Role-based access hardened end-to-end (client guards + server-side `staff_emails` allowlist enforced in the signup trigger). Theme toggle rewritten. Profile UI lives inside each role's dashboard. Auth pages guest-only. Dashboard shell + student pages rebuilt mobile-first. Student location card streamlined for privacy (raw coordinates removed; accuracy + Good/Fair/Poor flags displayed). Lecturer attendance-register PDF export added: per-course month/session picker, 2–8 ended sessions, browser-generated landscape A4 PDF, and a lecturer-only SECURITY DEFINER data RPC. OTP fallback added for student check-in. Face verification errors made specific (no match, accuracy/geofence reasons). Fixed login 500 by correcting profiles RLS (SECURITY DEFINER functions, no recursion). Fixed attendance RPC to remove devices dependency and drop device_id column. Sandbox onboarding/verification updated to the same burst pipeline (Tiny 416). **All migrations are applied through 33** (30 = 200 m accuracy ceiling, 31 = box geofence `ST_Covers`/area fix, 32 = face descriptor validation, 33 = server-computed face match confidence). Face capture uses a quality-gated 3-frame burst for enrolment and verification (SSD enrolment, Tiny 416 verification, full 68-point landmarks); the video-vs-canvas descriptor equivalence check passed; descriptor CHECKs are in place (`NOT VALID` until the validate script is run). Admin dashboard built (Home, Venues, Users & Roles, System Logs) with magic-link login and no signup; Venues supports circle and four-corner box geofence editing. Migration 33 (server-computed face match confidence) is applied and verified in the app: the client sends only the median descriptor distance, the database derives a calibrated score/band, retries create no row, review flags the record, and lecturers see only a rounded match-confidence percentage.

---

## 1. Status snapshot

| Area | Status | Notes |
|---|---|---|
| Core schema (`class_bars_schema_no_geo.sql`) | Done | Profiles, courses, venues, class_sessions, enrollments, face_embeddings, devices, attendance_records, otp_codes, audit_logs + RPCs |
| Security/policies (`migrations/01`) | Done | Staff policies, hardened `check_in_attendance`, immutability guards |
| Real attendance flow (`migrations/06`) | Applied | `face_embeddings` renamed/self-own policy; SECURITY DEFINER RPCs: `upsert_face_embedding`, `clear_face_embedding`, `enroll_self`, `get_session_attendance`; hardening; grants |
| Real-table GRANTs (`migrations/07`) | **Applied — fixes "permission denied"** | Explicit DML grants to `authenticated`, SELECT to `anon` on real tables + EXECUTE on client RPCs |
| Course ownership (`migrations/08`) | **Applied** | `courses.lecturer_id` FK + owner-scoped create/update policies |
| Role enforcement (`migrations/09`) | **Superseded by 10** | `staff_email_domains` domain allowlist replaced by `staff_emails` exact-email allowlist in migration 10; `handle_new_user` demotes non-allowlisted lecturers; profiles INSERT closed to `role='student'` |
| Lecturer allowlist (`migrations/10`) | **Applied** | `staff_emails` table (exact email match, replaces `staff_email_domains` domain match); `is_staff_email()` re-pointed; client `rolePolicy.ts` reads the same table |
| Admin section RLS (`migrations/11`) | **Applied** | RLS for admin CRUD on staff_emails, venues, audit_logs |
| Signup | Done | Student/Lecturer toggle + hCaptcha; `AuthContext.signUp` accepts `captchaToken` |
| Lecturer dashboard | Done | Collapsible sidebar (Overview, Courses, Update profile, Sign out), stat cards, session live page |
| Student dashboard | Done | Same shell/sidebar, Overview + Courses + Update profile pages, live face check-in, privacy-preserving location accuracy card, OTP fallback |
| New session form | Done | "Start now" vs "Schedule for later" + registration duration (5/15/30/60 min) that auto-computes session end |
| Face pipeline | Done | face-api 0.22.2; SSD MobileNetV1 for enrolment (`minConfidence` 0.6), Tiny face detector for verification (`inputSize` 416, `scoreThreshold` 0.4, fallback 320); full 68-point landmark net; 128-d recognition net; models in `public/models/`; pure math + model-version helpers in `src/lib/faceCompare.ts` |
| Face capture burst | Done — equivalence check passed; thresholds provisional | Quality-gated 3-frame burst for enrolment and verification; 250–400 ms interval; static oval + status; stops on hidden/unmount/60 s inactivity; dev-only video-vs-canvas equivalence check |
| Face descriptor validation (`migrations/32`) | **Applied** | Immutable safe validators + `NOT VALID` CHECKs for real and sandbox templates; validate script (`32_..._validate.sql`) promotes them to fully validated once preflight/cleanup are clean |
| Face match confidence (`migrations/33`) | **Applied** | Server-computed calibrated score/band from `face_match_config`; single-row config with `config_revision` incremented on each change (audit trail); explicit score clamping to [0,1]; `lock_timeout`/`statement_timeout` and `FOR UPDATE` on the config row; 9-arg face RPC returns `{outcome,record,band,config_version}` and retry creates no row; match fields stripped from the student check-in JSON; 8-arg RPC remains for OTP/manual and rejects face; lecturer roster exposes `match_score` (no `confidence_score`); `face_match_config` RLS select is admin-only (`is_admin_user()`); raw distance is never shown |
| Admin dashboard | Done | Magic-link login, no signup; Home (live stats), Venues (CRUD + circle/box geofence editor), Users & Roles (staff email allowlist), System Logs (audit_logs). Sidebar-driven navigation, all routes AdminRoute-guarded. |
| Geofencing (`migrations/12`) | **Applied** | PostGIS proximity check in `check_in_attendance`; one `geofences` row per venue (circle 2–50 m or four-corner box); gap-based decision table with small-fence handling; raw coordinates never stored; admin-only fence writes. |
| Admin geofence RPC (`migrations/13`) | **Applied** | `set_venue_geofence` made SECURITY DEFINER with explicit admin role check to prevent RLS subquery recursion |
| Single face embedding (`migrations/14`) | **Applied** | Prunes older/duplicate face embeddings per user and updates in-place, eliminating 409 unique_violation against `idx_face_embeddings_active_user` |
| Attendance register export (`migrations/15` + app) | **Applied** | Lecturer-owned course RPC for 2–8 completed sessions; pure register matrix builder; lazy landscape A4 PDF renderer; per-course export dialog with month/session selection |
| Profiles RLS fix (`migrations/26-27`) | **Applied** | SECURITY DEFINER functions for role checks, no recursion; proper access for students/lecturers/admins |
| Attendance RPC fix (`migration 29`) | **Applied** | Remove devices table dependency, drop `device_id` from attendance_records, keep compatible signature |
| OTP fallback | Done | `src/lib/attendanceOtp.ts`, `OtpFallbackCard`, integrated in StudentHome with quota/attempt logic. Edge functions `send-attendance-otp`/`verify-attendance-otp` (deployed to Supabase, not in repo): improved error handling to log/return the actual error detail instead of `"unknown"`; required `service_role` table grants on `otp_codes` and `ALLOWED_ORIGIN` CORS config for local dev |
| Consent + account deletion (migration 34) | Built — not applied | `consent_given_at` + `consent_version` on profiles; `record_consent(p_version)` RPC (students only, idempotent, audit trail); `delete_my_account()` RPC (students only, one transaction, anonymises attendance); `protect_profiles_consent` BEFORE INSERT OR UPDATE trigger blocks direct client consent writes (coexists with `trg_protect_profiles_role`); face enrolment and face check-in require consent; OTP/manual check-in works without consent. `delete_my_account` nulls audit_logs.ip_address/user_agent/user_id/entity_id and redacts metadata containing the deleted uuid; inserts one `account.deleted` audit row with no personal data. |
| Lecturer manual mark (migration 35) | Built — not applied | `get_session_enrolled_students(p_session_id)` RPC lists enrolled students with checked_in status; `lecturer_mark_present(p_session_id, p_student_id)` RPC marks a student present (method='manual', status='present') with audit trail; lecturer must own the session (class_sessions.lecturer_id = auth.uid()); session must be ongoing; student must be enrolled; 8-arg student check-in RPC rejects `p_method = 'manual'` with `manual_not_allowed`; OTP path unchanged. |
| Attendance history (migration 36) | Built — not applied | Five lecturer-only STABLE SECURITY DEFINER RPCs (`get_lecturer_sessions`, `search_my_students`, `get_student_history_for_lecturer`, `get_my_history`, `get_student_header_for_lecturer`), revoked from public/anon, granted to authenticated. Client: `src/lib/history.ts`, `/student/history`, `/dashboard/sessions`, `/dashboard/students`, `/dashboard/students/:id`, shared `SessionRow`. Counts not percentages; enrolment date = `enrollments.created_at`; no match scores/distances/coordinates in the UI. |
| Register PDF verification (QR, migration 37) | Built — not applied | `attendance_pdfs` table + `record_attendance_pdf` (lecturer-owned course) and `verify_attendance_pdf` (public) RPCs; client-generated 6-char code from a 32-symbol alphabet registered before the PDF is built; QR + footer verification code on the register PDF; public `/verify/:code` page. `VITE_PUBLIC_APP_URL` must be set. |
| Specific error messages | Done | Face verification shows "Could not match — try again", check-in failures specify poor accuracy/outside geofence/no geofence |
| Sandbox module | Updated | Sandbox onboarding/verification use the same burst pipeline with Tiny-416; descriptor validation added client-side and in migration 32 |

---

## 2. Latest phase — real attendance + unified dashboards

### 2.1 Real (non-sandbox) attendance flow
- `migrations/06_real_attendance_flow.sql`: column rename `embedding_encrypted` → `embedding_json` (plaintext, 128-float JSON), self-owned face template policy, and `SECURITY DEFINER` RPCs:
  - `upsert_face_embedding` / `clear_face_embedding` — own-row-only template management.
  - `enroll_self` — one-shot self-enrollment into a course (defaults `2025` / `Semester 1`).
  - `get_session_attendance` — owner-checked roster (joined to `profiles`) for the session live page.
- `check_in_attendance` hardened against impersonation; duplicate check-ins surface a stable "already recorded" error the client resolves gracefully.
- Data layer: `src/lib/realAttendance.ts` (get/upsert/clear embedding, enroll, roster, check-in) + `src/lib/faceCompare.ts` (pure: `MATCH_THRESHOLD=0.6`, `euclideanDistance`, `isMatch`, `FACE_MODEL_VERSION`, `parseEmbedding`, `faceConfidence`). `faceModels.ts` re-exports the model version.
- **Permission-denied root cause (confirmed):** PostgreSQL checks *privileges* before RLS — the base schema ships zero GRANTs, so real tables silently denied `authenticated`. `migrations/07` fixes it; verified working by the user.
- **Login 500 fix:** Recursive RLS on profiles caused 500 errors after migration 20. Fixed with SECURITY DEFINER functions (`current_user_role`, `is_admin_user`, `is_lecturer_user`) in migrations 26-27, no recursion.
- **Attendance devices error:** `check_in_attendance` referenced non-existent `devices` table. Migration 29 removes the check and drops `attendance_records.device_id`. Client passes `p_device_id: null` (compatible).
- **OTP fallback:** Added OTP API layer and UI for students when face verification fails repeatedly or on demand. Integrates with `send-attendance-otp`/`verify-attendance-otp` edge functions.
- **Specific errors:** Face no-match shows "Could not match — try again", check-in errors specify poor accuracy/outside geofence/no geofence/unknown reasons.

### 2.2 Course ownership
- `migrations/08_course_lecturer.sql` (applied): adds `courses.lecturer_id uuid references profiles(id)` (+index), replaces the staff-wide course create/update policies with owner-scoped ones (admin exception). Existing rows keep `lecturer_id NULL`; legacy courses won't show in "My courses" until an admin reassigns them.
- Client: `LecturerCourses` assigns `lecturer_id = user.id` on create and lists only own courses; `NewSession` course dropdown filters to owned courses.

### 2.3 Signup rework
- `src/pages/Signup.tsx`: segmented Student/Lecturer toggle (labels, submit text, and redirect adapt), hCaptcha required before submit (resets on error/role switch), lecturer → `/dashboard`, student → `/onboarding`.
- `AuthContext.signUp` gained an optional `captchaToken` forwarded to `signUp({ options: { captchaToken } })`.

### 2.4 Lecturer dashboard
- `src/components/DashboardShell.tsx`: collapsible sidebar (desktop pin to icon-only, persisted to localStorage; slide-over drawer on mobile) with brand + role badge, nav, and bottom Sign out. Nav routes in `src/lib/nav.ts` (`LECTURER_NAV` / `STUDENT_NAV`).
- `src/components/dashboard/StatCard.tsx` shared card: icon chip, uppercase label, big number, hint row, optional emerald live-pulse.
- `LecturerDashboard`: greeting + 4 stat cards (Total sessions, Live now w/ pulse, Upcoming, Courses taught) + Recent sessions (pulse on ongoing rows, Start/End/Cancel actions).
- `SessionLive` (`/dashboard/sessions/:id`): start/end/cancel, polled roster (3 s) with method/status badges and rounded match confidence, all inside the same shell.
- `LecturerProfile` (`/dashboard/profile`) uses a shared `ProfileSettings` editor.

### 2.5 Student dashboard
- Same `DashboardShell` (role label "Student dashboard", `STUDENT_NAV`):
  - Overview (`/student`): greeting, stat cards (Live now, Checked in today, Total check-ins, Face ready), live-class cards with pulsing "Live" badge → single-shot face verify → "You're checked in" confirmation.
  - Courses (`/student/courses`): My courses + enroll-in-catalog with stat cards (Enrolled / Available).
  - Update profile (`/student/profile`): shared `ProfileSettings` (student/staff field chosen by loaded role) + `FaceBiometricsCard` (face template add/update/remove).
- Profile is fully dashboard-native: the student/lecturer profile pages render inside the shared `DashboardShell`, and the old standalone `/profile` page now redirects known student/lecturer roles into their dashboard (`/student/profile`, `/dashboard/profile`). `/profile` survives only as the fallback for admins and unreadable roles.

### 2.6 New session form
- Segmented control: **Start now** vs **Schedule for later**.
- **Registration duration** (5/15/30/60 min) replaces the manual end-time picker; end = start + duration, previewed live ("Starts now · ends at … · registration open for 30 min").
- Start now: inserts the session already `ongoing` with `actual_start` set and navigates to the live attendance page. Schedule: validates a future start, inserts `scheduled`.

### 2.7 Face recognition pipeline
- face-api 0.22.2 (original package); `public/models/` complete (SSD MobileNetV1, Tiny face detector, 68-point landmark net, face recognition net).
- **Detection:** enrolment uses SSD MobileNetV1 with `minConfidence` 0.6 (Tiny 320 is used only if the SSD weights are not loaded); verification uses `TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 })`. Frames are passed raw (no pre-detection resize/crop) and inference runs on the main thread.
- **Landmarks and descriptor:** full 68-point landmark net (`USE_TINY_LANDMARKS = false`, `withFaceLandmarks(false)`) feeding the 128-d recognition net. Match distance is Euclidean; `MATCH_THRESHOLD = 0.6` remains the hard distance limit in `faceCompare.ts`.
- **Burst:** a quality-gated 3-frame burst (detection score ≥ 0.6, face size, pose, sharpness and brightness gates; 250–400 ms interval; 10 s timeout). Enrolment averages the burst descriptors; verification uses the median distance to the stored template. The camera preview stays live until the interaction ends and tracks stop on hidden/unmount/60 s inactivity. The dev-only video-vs-canvas descriptor equivalence check passed. Burst quality thresholds are provisional.
- **Sandbox:** onboarding and verification use Tiny 416 with the same burst logic.
- Model version `face-api-recognition-full68-v1` pins template compatibility: stale templates (version mismatch) are rejected client-side and prompted for re-enrolment. The calibration in §2.10 is valid only for this pipeline and model version; changing detectors, landmark model or distance function requires recalibration.
- Model version pins template compat: stale templates (version mismatch) are rejected client-side and prompted for re-enrollment.

### 2.8 Geofencing (PostGIS proximity check)

- `migrations/12_geofencing.sql` adds PostGIS, a `geofences` table (circle or four-corner box; circles 2–50 m, boxes valid/≥4 m²/every corner ≤50 m from the centre), `venues.geofence_id` (unique, `ON DELETE SET NULL`), an `AFTER DELETE` trigger that removes a deleted venue's fence, attendance `flag_reason` + `location_distance_m` + `location_accuracy_m`, and restrictive admin-only venue INSERT/UPDATE/DELETE policies over migration 11's permissive ones. The old inline venue lat/lng/radius columns were dropped; migration 12 was edited in place because it had not been executed.
- The direct `attendance_records` INSERT path (`Students insert own attendance` + 07 grant) is revoked, so all writes must go through the SECURITY DEFINER check-in RPC. The old 5-argument `check_in_attendance` is dropped; the new 8-argument version requires lat/lng/accuracy. `set_venue_geofence` is SECURITY DEFINER with an explicit admin role check (migration 13) to avoid RLS subquery recursion.
- Decision table (gap = distance from the fence, 0 inside/on the edge; half_size = radius or sqrt(box area)/2; good_limit = min(10, half_size)): invalid/null/NaN/accuracy > 200 → `no_location` (exactly 200 is usable); venue without fence → `no_geofence`; gap = 0 → normal; gap > accuracy → `outside`; 0 < gap ≤ accuracy and accuracy ≤ good_limit → `outside_good_accuracy`; same band with accuracy > good_limit → allowed, status `flagged`, reason `low_accuracy_overlap`. Only the gap and reported accuracy are stored for flagged records (DPA minimisation). Browser accuracy is roughly a 68% confidence radius, so honest students near an edge may occasionally be blocked and retry.
- Client: `src/lib/geofence.ts` (pure validation, box corner ordering/area/validation, small-fence half-size, coordinate parsing, geolocation wrapper, block messages) + Node tests. `StudentHome` captures a fresh high-accuracy fix before check-in and shows a distinct amber flagged confirmation. `SessionLive` shows the flag reason with the amber status badge.
- Admin Venues: list shows `Circle, 12 m`, `Box`, or `Not set`; the edit dialog lazy-loads a Leaflet map (`VenueGeofenceMap`) with Circle/Class box tabs, a 2–50 m radius slider (step 0.5), four draggable numbered corners with a live polygon, map click to place the next empty corner, pasted `"lat, lng"` rows, "use my current location" (next empty corner for boxes, reporting each accuracy), a live small-fence notice, zoom up to 22, and a confirm step that deletes the geofence row. Saves go through `set_venue_geofence`; FK (23503) and unique (23505) errors are mapped to clear messages.
- Manual verification: `tests/sql/geofencing_checks.sql` (run migration 12 twice first) covers schema/function privileges, radius 2/50 and box valid/crossed/collinear/tiny/oversized geometry, admin/lecturer/student RLS, unique sharing, venue cascade deletion, closed direct insert, the full decision table for circles and boxes (including gap = accuracy), clockwise/anticlockwise equality, and small-fence cases.

### 2.9 Lecturer attendance register PDF export (`current`)

- **Server data contract:** `migrations/15_course_register_data.sql` adds `get_register_data(p_course_id uuid, p_session_ids uuid[])`, a `STABLE SECURITY DEFINER` RPC with a fixed `search_path`. It requires an authenticated `lecturer` profile, `courses.lecturer_id = auth.uid()`, and 2–8 distinct sessions that all belong to the course and are `completed`. Public/anon execute is revoked; authenticated is granted. The roster is the course's enrollments left-joined to final `attendance_records`, so each session/student pair is unique.
- **Data minimisation:** the RPC returns only `session_id`, `session_start`, `full_name`, `registration_number` (aliased from `profiles.student_number`) and final `status`. No face embeddings, confidence scores, coordinates, distance, accuracy or unrelated profile fields are exposed, and real-table RLS is unchanged.
- **Pure matrix builder:** `src/lib/registerPdf/buildRegisterMatrix.ts` sorts sessions by start time/id and students by natural registration-number order (unnamed/unregistered last), rejects anything outside 2–8 unique sessions, and marks missing attendance rows as `ab`. Status mapping: `present`/`late` → `pr`, `flagged` → `prf`, `absent`/missing → `ab`; the final DB status wins over any earlier duplicate row. Empty rosters survive because the RPC emits per-session sentinel rows and the PDF still renders the table header.
- **PDF renderer:** `src/lib/registerPdf/renderRegisterPdf.ts` uses `jspdf` + `jspdf-autotable` in landscape A4. It includes course code/name, lecturer, month, generated timestamp, session date headers (time added when two sessions share a date), a repeated header row on every page, `avoid` row page breaks, a B&W status legend and `Page x of y` footers. Filename: sanitised `<course-code>_register_<YYYY-MM>.pdf`.
- **Lazy loading + UX:** the per-course **Export register** button lives in `src/pages/LecturerCourses.tsx`; `jspdf`/`jspdf-autotable` are imported dynamically only after the lecturer clicks Export, so the 432 kB renderer chunk is not part of the main bundle. The dialog loads completed sessions, defaults to the latest month with ended sessions and the first up-to-8 sessions, lets the lecturer switch months/select sessions, blocks a ninth selection, and shows loading/error/`Generating…` states. A reserved `onRegisterExported()` hook is called after a successful download for a future audit event.
- **Verification:** `tsc -b`, ESLint on changed files, 8/8 `tests/registerPdf.test.ts`, and the Vite production build pass. A 60-student × 8-session smoke PDF rendered as 3 pages with repeated headers and correct page numbers; an empty-roster PDF rendered its header and legend. Migration 15 is applied; the PDF download still needs a spot-check on a real lecturer account.

### 2.10 Server-computed face match confidence (`migrations/33`, applied)

- **Why:** the previous flow compared descriptors in the browser and sent a client-computed confidence, so the stored number was not trustworthy and raw distances leaked into diagnostics. Migration 33 makes the score server-authoritative while keeping the descriptor comparison on-device.
- **Calibration:** the raw distance is mapped to a match confidence with Platt scaling, `score = 1 / (1 + exp(A·d + B))`. The curve was first fitted on the LFW benchmark (test EER ≈ 1.8–2.1%, AUC ≈ 0.993–0.994) and then refitted on the MUBAS sandbox pilot (18 students; 20 genuine and 680 impostor single-frame pairs) with A and B both free and equal class weight. Result: `A = 19.8713`, `B = -10.7966` (50% at d ≈ 0.543). Leave-one-student-out on the pilot: ECE 0.086, AUC 0.918, EER ≈ 16% (versus ≈ 2% on LFW). The score is a match confidence, not the probability that the person is who they claim to be. Limitations: small pilot, single frames, burst/median effect not yet measured; refit if more consented data becomes available. The earlier `1 − distance` figure was not a calibrated measure and has been removed.
- **Config:** `public.face_match_config` is a single-row calibration table (`model_version`, `config_revision`, `a`, `b`, `accept_score`, `review_score`, `source_note`, `effective_from`, `updated_at`). Seed: `face-api-recognition-full68-v1`, `A=19.8713`, `B=-10.7966`, accept `0.80`, review `0.60`. `config_revision` increments on each update and is recorded in `audit_logs`. Only admins can read or update it (RLS select is `is_admin_user()`); updates go through `set_face_match_config(...)`, which writes an `audit_logs` row.
- **Scoring:** `public.face_match_score(p_distance)` is `STABLE SECURITY DEFINER`, rejects NULL/NaN/Infinity/negative/>10 m, computes `1 / (1 + exp(A*d + B))`, clamps the score to [0,1], and returns `score`, `band` (`accept`/`review`/`retry`) and `config_version`. Execute is revoked from public/anon/authenticated.
- **Check-in contract:** the internal `_check_in_attendance(...)` owns the existing geofence decision table and now also writes nullable `match_distance`, `match_score`, `match_band` and `match_config_version`. The 9-argument `check_in_attendance(..., p_match_distance)` returns `jsonb` `{outcome, record, band, config_version}`; match fields are stripped from the `record` returned to students; `retry` returns no record. The 8-argument overload remains for OTP/manual, returns `attendance_records`, and rejects `p_method = 'face'`.
- **Flag coexistence:** one comma-separated `flag_reason` can hold both `low_accuracy_overlap` and `face_review`; location-only rows keep the old reason. `match_band` is constrained to `accept`/`review` so a retry can never be stored.
- **Lecturer UI:** `get_session_attendance` returns `match_score`; the legacy `confidence_score` is no longer returned by the roster RPC. `src/lib/faceMatch.ts` rounds to the nearest 10 and clamps to 10–90; `SessionLive` shows `Match confidence: NN%` with the approved tooltip, and formats comma-separated flag reasons. Raw distance is never shown.
- **Student UI:** a `retry` outcome increments the attempt counter and shows “Could not match — try again” without a record; `accept` checks in; `review` checks in and shows the generic flagged message. OTP appears after two failed attempts. The client maps `face_distance_required` to an app-update prompt and warns when the server `config_version` differs from the client `FACE_MODEL_VERSION`. `FaceCaptureFrame`/`FaceTest`/`FaceVerify`/`SandboxStudent` no longer display raw distances, thresholds or combined distances.
- **Safety:** the distance is still client-supplied and is not tamper-proof; this design makes the score derivation server-side but cannot prove the descriptor match happened on a genuine camera. PostgREST resolves the 8-argument (OTP/manual) and 9-argument (face) overloads correctly. No liveness check is performed.
- **Verification:** `tsc -p tsconfig.app.json --noEmit` and ESLint on changed files pass; `tests/faceMatch.test.ts` 3/3 and the existing `realAttendance`/`faceCompare`/`geofence`/`registerPdf` suites 44/44 pass. Migrations 32 and 33 are applied, and the face accept/review/retry flows, OTP fallback and geofence flags were verified in the running app.

### 2.11 Consent + self-service account deletion (migration 34, built — not applied)

- **Consent columns:** `profiles.consent_given_at` (timestamptz, NULL = not recorded) and `profiles.consent_version` (text). Stored only through `record_consent(p_version)` RPC — never directly settable by clients.
- **`record_consent(p_version)`:** SECURITY DEFINER RPC, students only (role from `profiles`, never `user_metadata`), fixed `search_path`. Validates `p_version` against `^[0-9]{4}-[0-9]{2}-v[0-9]+$` and length ≤ 20. Sets `consent_given_at = now()` and `consent_version`. Idempotent: same version keeps original timestamp; new version updates both. Writes `audit_logs` row. Revoked from public/anon, granted to authenticated.
- **Consent protection:** BEFORE INSERT OR UPDATE trigger `trg_protect_profiles_consent` on `profiles`. When `current_user IN ('authenticated', 'anon')`: INSERT rejects if consent columns are not null; UPDATE rejects if either consent column differs from OLD. Coexists with `trg_protect_profiles_role` (different name, both BEFORE; no ordering dependency). SECURITY DEFINER RPCs pass. `handle_new_user` INSERT only sets `id, full_name, role` so consent cannot be preset at signup.
- **Consent enforcement:** `upsert_face_embedding` (search_path = public, pg_temp) and `_check_in_attendance` (9-arg face path) raise `consent_required` when `profiles.consent_given_at IS NULL`. OTP/manual (8-arg) check-in, course browsing, and enrolment work without consent. Existing face templates are NOT deleted or altered.
- **`delete_my_account()`:** SECURITY DEFINER RPC, students only, one transaction, fixed `search_path`, derives user from `auth.uid()` (no argument). Deletes `face_embeddings`, `enrollments`, `otp_codes`; anonymises `attendance_records` (student_id, confidence_score, flag_reason, location_distance_m, location_accuracy_m, match_distance, match_score, match_band, match_config_version all NULL; keeps id/session_id/method/status/check_in_time/created_at); unlinks `audit_logs` (ip_address, user_agent, user_id in one update where user_id = v_uid; entity_id = null where entity_id = v_uid; metadata = '{}' where metadata contains v_uid); inserts one `account.deleted` audit row (user_id/entity_id/ip_address/user_agent all NULL, metadata '{}'); deletes `profiles` row; deletes `auth.users` row. Revoked from public/anon, granted to authenticated.
- **Client:** `src/lib/consent.ts` (CONSENT_VERSION, DATA_CONTACT_EMAIL, helpers), `src/lib/account.ts` (recordConsent, deleteMyAccount), `ConsentCard` + `DangerZoneCard` on `/student/profile`, consent banner on `StudentHome`, face enrolment gated behind consent, consent step added to `/onboarding`.

### 2.12 Lecturer manual "mark present" on live sessions (migration 35, built — not applied)

- **`get_session_enrolled_students(p_session_id)`:** STABLE SECURITY DEFINER RPC. Caller must be an authenticated lecturer who owns the session (`class_sessions.lecturer_id = auth.uid()`, same rule as `get_session_attendance`). Returns one row per enrolled student: `student_id`, `full_name`, `registration_number` (profiles.student_number aliased), `checked_in` boolean. No face data, scores, email, or coordinates. Revoked from public/anon, granted to authenticated.
- **`lecturer_mark_present(p_session_id, p_student_id)`:** SECURITY DEFINER RPC. Caller = auth.uid() must be role 'lecturer' (read from profiles via `is_lecturer_user()`, never user_metadata) AND own the session. Session must be ongoing (raises 'Session is not open for check-in'). Student must be enrolled (raises 'Student is not enrolled in this course'). Inserts `attendance_records` with `method='manual'`, `status='present'`, all match_*/location_*/confidence_score/flag_reason NULL. On unique_violation raises 'already recorded'. Writes `audit_logs` row: action `attendance.manual_marked`, entity_type `attendance_records`, entity_id = new record id, user_id = lecturer, metadata = `{session_id}` only (no student identifiers). Admins NOT allowed. Revoked from public/anon, granted to authenticated.
- **Student path closed:** `_check_in_attendance` and the 8-argument `check_in_attendance` both reject `p_method = 'manual'` with stable error `manual_not_allowed`. OTP path unchanged.
- **Client:** `src/lib/manualMark.ts` (getSessionEnrolledStudents, lecturerMarkPresent wrappers), `src/lib/studentSearch.ts` (filterStudents helper), `SessionLive.tsx` manual mark card (visible only while session is ongoing, search input with debounce, enrolled list fetched once and refreshed after each mark, confirmation dialog with Cancel-focused initial state, "Mark" button or "Checked in" badge per row). Roster rows show "Manual" method badge for manual marks.
- **Tests:** `tests/studentSearch.test.ts` (empty query, whitespace, partial reg, multi-word names, limit, checked-in inclusion), `tests/sql/lecturer_manual_mark_checks.sql` (owner can list/mark, other lecturer/student/admin/anon rejected, scheduled/completed/cancelled rejected, unenrolled student rejected, duplicate mark raises 'already recorded', already-checked-in shows true, audit row has no student identifiers, 8-arg RPC rejects 'manual' but accepts 'otp', roster shows manual mark).

### 2.13 Attendance history (migration 36, built — not applied)

Migration 36 (`migrations/36_history_rpcs.sql` + `migrations/36_history_rpcs_rollback.sql`) adds six lecturer-only, STABLE SECURITY DEFINER history RPCs, all revoked from `public`/`anon` and granted `EXECUTE` to `authenticated`, with a fixed `search_path` and `lock_timeout`/`statement_timeout`. None expose `flag_reason`, `match_score`, `match_band`, `match_distance`, `location_distance_m`, `location_accuracy_m` or `confidence_score`.

- `get_lecturer_sessions(p_course_id, p_limit, p_offset)` — the lecturer's sessions across all courses (or one course), newest first, with `checked_in_count` and `total_count` for pagination. Cancelled excluded. `p_course_id` null means all courses.
- `search_my_students(p_query, p_limit)` — kept in the migration but unused by the app (server-side search replaced by client-side filtering of `list_my_students`).
- `list_my_students()` — every distinct student enrolled in at least one of the lecturer's courses, with `course_codes` (text[]) of that lecturer's courses the student is in. Hard cap `LIMIT 1000`. No email, no face data.
- `get_student_history_for_lecturer(p_student_id, p_course_id)` — one row per non-cancelled session with result derivation: record status (`present`/`late`/`flagged`/`absent`), completed-with-no-record → `absent`, ongoing → `live`, scheduled → `upcoming`; plus `method`. Sessions before the student's enrolment date are excluded unless a record exists. Raises 'Student not found in your courses' when the student shares none of the lecturer's courses.
- `get_my_history(p_course_id)` — the caller's own results for a course (students only); same result derivation, no `method`. Raises 'You are not enrolled in this course'.
- `get_student_header_for_lecturer(p_student_id)` — name + registration number only when the student shares a course with the lecturer; else raises 'Student not found in your courses'.

**Client:**
- `src/lib/history.ts` — typed RPC wrappers with friendly error mapping, plus pure helpers (`summariseHistory`, `lecturerStatusCode`, `studentResultLabel`, `methodLabel`, `filterStudents`, `formatDateTime`) and a `makeRequestGuard` stale-response guard. Unit tests in `tests/history.test.ts`.
- Types added to `src/types/db.ts`: `HistoryResult`, `LecturerSessionRow`, `StudentListRow`, `LecturerHistoryRow`, `MyHistoryRow`, `StudentHeaderRow`.

**Routes (all inside existing fail-closed `RoleRoute` guards):**
- Student: `/student/history` (`History` added to `STUDENT_NAV` and the mobile bottom tab bar: Home, Courses, History, Profile). Student picks an enrolled course, sees "Present X of Y ended sessions" and per-session date/time + result label. Students never see methods, scores, distances or flag reasons.
- Lecturer: `/dashboard/sessions` (index; `/dashboard/sessions/:id` unchanged) — all sessions read-only, course filter, load-more pagination (20/page, button hidden via `total_count`), skeleton/empty/error-with-retry, shared `SessionRow` component extracted from `LecturerDashboard`. Reached via an "All sessions" button in the Recent sessions card header. Not a nav item.
- Lecturer: `/dashboard/students` (`LecturerStudents`) — loads the full student list **once on mount** via `list_my_students()` (skeleton while loading, error with retry, empty state "No students are enrolled in your courses yet"), shows a count ("N students"), a labelled `type="search"` input that filters **instantly client-side** with `filterStudents` (no debounce, no 2-character minimum, no server call while typing), rows sorted by name with registration number and course-code badges, capped at 50 rows per page with a "Show more" button (filter runs over the full list), "No students match your search" empty state, rows navigate to `/dashboard/students/:id`. List kept in component state only (no localStorage, URLs, or console logging of names). The list is capped at 1000 server-side. `/dashboard/students/:id` (`LecturerStudentDetail`) — header via `get_student_header_for_lecturer`, summary line, optional course filter, register-code statuses (`pr`/`prf`/`ab`, late counts as pr), method badge (Face/OTP/Manual) only when a record exists, legend under the list, friendly 403-style state. `Students` was already in `LECTURER_NAV`.

**Enrolment date** = `enrollments.created_at` (interpreted in Africa/Blantyre). **Counts, not percentages.**

**SQL checks:** `tests/sql/history_checks.sql` (rolls back; run as postgres after migration 36) covers cross-lecturer isolation, the anonymised-record exclusion, enrolment-date rule, result derivation, role locks, anon privilege, search, pagination and output-column safety.

**Verification:** `tsc -p tsconfig.app.json --noEmit`, ESLint on changed files, `tests/history.test.ts` 6/6 and existing suites pass; Vite build clean. Migration 36 is BUILT, NOT APPLIED (run `tests/sql/history_checks.sql` after applying on a branch).

### 2.14 Verifiable attendance register PDFs (QR codes) — migration 37 (`current`, BUILT, NOT APPLIED)

Adds verifiable QR codes to the lecturer attendance-register PDF so anyone can check that a PDF was really generated by Class-BARS.

- **Migration 37** (`migrations/37_attendance_pdfs.sql`, not applied): new `public.attendance_pdfs` table (`id`, `course_id` nullable `ON DELETE SET NULL`, `pdf_code` unique with CHECK `^[A-HJ-NP-Z2-9]{6}$`, `created_at`), RLS enabled with no policies, all table privileges revoked. Two SECURITY DEFINER RPCs:
  - `record_attendance_pdf(p_course_id, p_pdf_code) -> (id, created_at)` — lecturer must own the course; code trimmed/upper-cased and regex-validated; unique_violation → `pdf_code_taken`; writes an `audit_logs` row (`register.exported`, `course_id` only in metadata). Granted to `authenticated`, revoked from `public`/`anon`.
  - `verify_attendance_pdf(p_code) -> (course_code, course_name, created_at)` — STABLE, public (anon + authenticated); malformed input returns no rows; left-joins courses so fields may be NULL after course deletion; exposes nothing else. Granted to `anon` and `authenticated`, revoked from `public`.
  - Rollback: `migrations/37_attendance_pdfs_rollback.sql`. WARNING: rolling back invalidates every PDF already issued.
- **Client code** (`src/lib/registerPdf/pdfCode.ts`): `generatePdfCode()` (6 chars from the 32-symbol alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, `crypto.getRandomValues`, `byte & 31` — no modulo bias), `normalisePdfCode`, `isValidPdfCode`, `buildVerifyUrl` (uses `VITE_PUBLIC_APP_URL`, falls back to `window.location.origin`). Unit tests in `tests/pdfCode.test.ts`.
- **RPC wrappers** (`src/lib/registerPdf/pdfActions.ts`): `recordAttendancePdf(courseId, code)` and `registerPdfWithRetry(courseId)` — generates a code and retries with a NEW code up to 5 times ONLY on `pdf_code_taken`; other errors abort.
- **Export flow** (`src/pages/LecturerCourses.tsx`, `src/lib/registerPdf/renderRegisterPdf.ts`): on Export, the code is registered first; if registration fails the dialog shows the error and no PDF is produced. The render function takes the code; the QR (errorCorrectionLevel M, ~22×22 mm) is placed top-left inside the margin with the code + "Scan to verify" caption beneath; the header text block shifts right by the QR width + ~6 mm gap; the table start is pushed down only if needed. Every page's footer adds "Verification code: <code> · verify at <host>" next to "Page x of y". The QR and code never include student data.
- **Verify page** (`src/pages/VerifyPdf.tsx`, `src/lib/registerPdf/verifyPdf.ts`, route `/verify/:code` in `src/App.tsx`): public, works signed in or out, outside `RoleRoute`/`GuestRoute`. Mobile-first. States: loading skeleton; VERIFIED (green tile, check icon, "Verified document", course code/name + Africa/Blantyre date, muted note); NOT FOUND/malformed (amber warning tile); network/server error (neutral, Retry button, never presented as "fake"). Never shows lecturer/student/attendance data. Unit test in `tests/verifyPdf.test.ts`.
- **Docs:** `VITE_PUBLIC_APP_URL` documented in `README.md` and `.env.example`; migration added to the README deploy order.
- **Known limitation:** the QR proves a code was issued by Class-BARS; it does not prove the PDF content was not edited afterwards.


### 3.1 Theme toggle rewritten (`current`)
- **Root cause:** two effects raced over `documentElement` — effect A set the class, effect B (from the old selection flow) removed it; React bailed out on an unchanged `resolvedTheme` so the class was never re-added → toggle appeared dead.
- **Fix:** `src/lib/themeUtils.ts` (pure: `Theme`, `THEMES`, `THEME_STORAGE_KEY`, `isTheme`, `prefersDark`, `readStoredTheme`, `resolveTheme`, `nextTheme`) + `src/contexts/ThemeContext.tsx` (single apply-effect on derived `resolvedTheme`, `cycleTheme`, live `matchMedia` listener, allow-listed storage). `index.html` blocking init script kills first-paint flash; `:root`/`.dark` `color-scheme` keeps scrollbars/native widgets correct.
- **UI:** `src/components/ThemeToggle.tsx` (single cycling button light→dark→system), mounted in `Navbar` and the `DashboardShell` sidebar; old dropdown removed.

### 3.2 Role access hardening (`current`)
- **Root cause:** role was self-declared at signup (`signUp({ options: { data: { role } } })`), stored by `handle_new_user()`, then **trusted** from client-writable `auth.user_metadata` — and guards were fail-open (`/dashboard` only checked "has a lecturer-ish profile"). Clients also self-provisioned `profiles` rows on `PGRST116`, writing their own `role`.
- **Fix (client-guard scope, per user decision):**
  - `src/lib/rolePolicy.ts` — staff allowlist (DB-backed `staff_emails`, exact email match seeded with `lecturer@mubas.ac.mw`); `assertRoleAllowed` rejects lecturer signup on non-allowlisted addresses (`AuthContext.signUp` enforces it); `postSignupPath` routes lecturer→`/dashboard`, else→`/onboarding`.
  - `src/contexts/RoleContext.tsx` — role read from `profiles.role` via `maybeSingle`, **never** from `user_metadata`; fail-closed `status: "loading" | "ready" | "unavailable"`.
  - `src/lib/guardPolicy.ts` + `src/components/RoleRoute.tsx` — shared fail-closed guard (`authLoading`/`status` spinner → sign-out → login with `state.from` → non-ready → `/profile` → mismatch → own home). `LecturerRoute`/`StudentRoute` wrappers deleted; `<RoleRoute role="student">`/`<RoleRoute role="lecturer">` inline in `App.tsx`.
  - All hardcoded `user_metadata?.role` reads removed (Navbar/Home/Login/Signup/Profile/ProfileSettings); `PGRST116` self-upsert branches removed (missing profile → explicit error, no more self-authoring). Provider order: `ThemeProvider > AuthProvider > RoleProvider > App`.
- **New tests:** `tests/rolePolicy.test.ts`, `tests/roleGuards.test.ts` (`decideGuard`), `tests/theme.test.ts` (`nextTheme`/`resolveTheme`/`readStoredTheme`). 23 added, all passing; lint + tsc + build clean.

### 3.3 Sanity note
- **Server-side enforcement now in place (migrations/10).** The lecturer allowlist lives in the DB (`staff_emails`) and `handle_new_user()` demotes any non-allowlisted `role: "lecturer"` to `student` — a hand-rolled `supabase.auth.signUp()` can no longer mint a lecturer. The client reads the same table at sign-up (`src/lib/rolePolicy.ts`); DB is the single source of truth. The client `profiles` INSERT policy is also closed to `role = 'student'` (previously any client could create their own lecturer/admin row).

---

### 3.4 Auth pages are guest-only; no nav/footer on them

- `src/lib/guardPolicy.ts` gained a second pure decision, `decideGuestAccess` (inverse of `decideGuard`): signed-out users → allow; signed-in students → `/student`, lecturers → `/dashboard`; admins/unreadable roles → `/profile`.
- `src/components/GuestRoute.tsx` wraps sign in / sign up in the same fail-closed style as `RoleRoute` (spinner while auth or the role read is in flight, `<Navigate replace>` otherwise).
- `src/App.tsx` wraps `/login` and `/signup` in `<GuestRoute>`: a logged-in user can no longer open the auth pages.
- `Navbar`/`Footer` removed from `Login` and `Signup` — the auth pages are now a bare centered card on the gradient background.
- `tests/roleGuards.test.ts` extended with the `decideGuestAccess` matrix (guest allow, student/lecturer redirect, admin/unreadable → `/profile`, in-flight loading).

### 3.5 Profile lives inside each dashboard (no standalone page)

- `src/components/dashboard/FaceBiometricsCard.tsx` (NEW) — face template add/update/remove UI extracted from the old standalone `Profile` page; rendered on the student dashboard profile.
- `src/pages/StudentProfile.tsx` — now renders `ProfileSettings` + `FaceBiometricsCard` inside `DashboardShell`.
- `src/pages/StudentHome.tsx`, `src/pages/Onboarding.tsx`, `src/pages/Home.tsx` — student profile entry points now point at `/student/profile` instead of the standalone `/profile`.
- `src/pages/Profile.tsx` — known student/lecturer roles are redirected into their dashboard (`/student/profile`, `/dashboard/profile`); the page survives only as the admin / unreadable-role fallback, and the student-only face section was removed (now dead code there).

### 3.6 Mobile-first dashboard shell + student pages (`current`)

- Dashboard shell redesigned for mobile: collapsible desktop sidebar (persisted in localStorage) + sticky mobile top bar + **fixed bottom tab bar** (short nav labels `Home`/`Courses`/`Profile` live under tab icons). Role-agnostic via `useRole()`, so the lecturer dashboard inherits it too.
- Ported from a newer draft found outside the repo (`/mnt/d/classBars/src`): `DashboardShell`, `nav.ts`, `FaceBiometricsCard`, `ProfileSettings`, `StatCard`, `StudentHome`, `StudentCourses`, `StudentProfile`, plus new `lib/dialogClasses.ts` (`fullScreenOnMobile`).
- New Base UI (v1.5) UI primitives: `ui/dialog.tsx` (Dialog, DialogContent, DialogHeader/Footer/Title/Description), `ui/tabs.tsx` (Tabs, TabsList, TabsTrigger, TabsContent — active tab uses `data-active`), `ui/input.tsx`.
- Face enrollment + verify now run inside a dialog that is **full-screen on phones** (camera room, notch/home-indicator insets); remove-face is an in-dialog confirm (`DialogFooter`, `max-sm:flex-col-reverse`) instead of `window.confirm`.
- `StudentHome`: skeleton loaders while sessions load (`sessionsLoaded`), 3-up stat grid on mobile, `Dialog`-based verify flow, "class is no longer live" guard, auto `already recorded` recovery.
- `StudentCourses`: Tabs (My courses / Browse) + catalog search (`Input type="search"`) + enroll confirm dialog.
- `index.css`: tap-highlight transparency, `overscroll-behavior-y: none`, `touch-action: manipulation` on buttons/links/tabs, and a `prefers-reduced-motion` block.
- Verification: `tsc -b`, `eslint`, `vite build` all clean; tests 73/74 pass (same pre-existing `schema.test.ts` failure).

### 3.7 Student location privacy & accuracy simplification (`current`)

- **StudentHome location card**: Raw latitude and longitude values removed from the card UI. Displaying high-precision coordinate numbers cluttered the interface and contradicted the privacy reassurance note ("Coordinates stay on this device — check-in stores only distance and accuracy").
- **Accuracy & Quality indicators**: Location card now features a concise status row displaying:
  - An accuracy quality badge: **Good** (emerald), **Fair** (amber), or **Poor** (destructive), with explicit dark-mode styling (`dark:text-emerald-400`, `dark:text-amber-400`).
  - Reported device accuracy in metres: `±{accuracy} m accuracy`.
  - Contextual warning if accuracy exceeds `MAX_ACCURACY_M` (> 200 m).
- **Loading skeleton**: Replaced the previous 2-card coordinate placeholder with a single matching rounded pill skeleton.
- **Verification**: Verified clean against ESLint, `tsc -b`, unit tests (`tests/geofence.test.ts`), and the full production Vite build.

---

## 4. Earlier phase — sandbox / demo + auth (history)

- Sandbox built per `CLASS-BARS_SANDBOX_MODULE_SPEC.md`, **Option B** (fully separate `sandbox_sessions` / `sandbox_checkins` / `sandbox_participants`, no writes to real tables), identity via Supabase Anonymous Sign-ins, polling instead of Realtime. Sandbox student flow is 2-step: onboard (name + face) once per UID, then live-verify to check in.
- hCaptcha gates sandbox join + login (sitekey in `.env`, secret only in dashboard; dev-safe when key absent).
- Database drift cleanup: `migrations/03_table_details.sql` (read-only report), `migrations/04_sandbox_profile_exclusion.sql` (hardened `handle_new_user`, awaits execution), `scripts/reset_supabase_project.sql` (destructive full reset rebuilding from tracked files — chain runs 01, 02, 04, 05, 06, 07, 08; skips the 03 report).
- `migrations/02` rewritten fully idempotent.

---

## 5. Decisions log (latest)

| Decision | Rationale |
|---|---|
| Face template stored as plaintext `embedding_json` (column renamed) | Template is app data; combine with RLS self-ownership instead of app-layer encryption |
| Self-serve `enroll_self` RPC | Lets students enroll in any course by code without lecturer action |
| Face as the check-in credential (method `face`, server-computed match confidence) | Reuses the face-api pipeline; the database derives the score from the descriptor distance; OTP is the fallback |
| Course now owned by the creating lecturer (`lecturer_id`) | "Courses you schedule" scoped per lecturer; dropdowns show only own courses |
| One shared `DashboardShell` + `StatCard`/`ProfileSettings` for both roles | Guarantees the student dashbooard is visually consistent with the lecturer's |
| Start-now sessions insert as `ongoing` directly (no RPC) | `start_session` RPC is unnecessary when the insert policy already binds to `auth.uid()` |
| Single "registration duration" select drives end time | Simpler UX than free-form end pickers; matches 5/15/30/60-minute class windows |
| Lecturer sign-up gated by a staff email allowlist | Role is an auth decision; exact email allowlist is the proxy for "staff" |
| Allowlist lives in the DB (`staff_emails`), enforced by `handle_new_user`; client reads the same table | Env vars can't be read by Postgres; a single DB-backed source of truth closes the hand-rolled `signUp` bypass and removes the client-duplicated list |
| Role read from `profiles.role`, never `auth.user_metadata` | `user_metadata` is client-writable; `profiles.role` is written by the signup trigger |
| Role guards are fail-closed (`loading`/`unavailable`/mismatch ⇒ deny, mismatches redirect to their own home) | Inverts the prior fail-open behaviour that let anyone announce `/dashboard` or `/student` |
| Clients no longer self-provision `profiles` rows (PGRST116 self-upsert removed) | Self-UPSERT let callers write their own `role`; missing profile now surfaces an explicit error |
| Theme = single cycling button (light→dark→system), no dropdown, single derived-`resolvedTheme` effect + FOUC-guard init script | Per user decision; removes the two-effect race that made the toggle appear dead |
| `decideGuard` extracted as a pure function (`src/lib/guardPolicy.ts`) | Makes the fail-closed matrix unit-testable without a DOM |
| Profile UI lives inside each role's dashboard; standalone `/profile` redirects known roles there, keeps admin/unreadable fallback | Profile is content, not a page — like Courses/Overview it renders in the shared `DashboardShell`; face enrollment moved into the student dashboard as `FaceBiometricsCard` |
| Mobile = bottom tab bar + sticky top bar; desktop = collapsible sidebar; dialog content full-screen on phones (`fullScreenOnMobile`) | Matches the newer app-wide draft; phone-first layouts give the camera room and respect safe-area insets, and a fixed tab bar beats a drawer for one-thumb navigation |
| All dashboards share one role-neutral shell | `DashboardShell` reads the role from `useRole()`, so the mobile/mobile-first shell upgrades the lecturer dashboard for free |
| Geofence is a server-side proximity check, not proof of presence | GPS can be spoofed; it complements face matching and only produces a review flag at the accuracy boundary |
| Store only distance and reported accuracy, never raw student coordinates | DPA data minimisation; the precise location is not needed after the server decision |
| Add RESTRICTIVE admin-only venue write policies in 12 | Migration 11's permissive venue policies accepted any signed-in user; the fence must not be movable by students |
| Drop the 5-arg check-in RPC and revoke direct attendance INSERT | Otherwise the fence is advisory and can be bypassed by calling an old function or inserting directly |
| Venues without a fence block check-in | Fail closed; admins must explicitly configure a room before it can be used for attendance |
| Register data goes through one lecturer-checked SECURITY DEFINER RPC, not broader table SELECT | Keeps the PDF contract to the minimum fields and validates ownership, completed-session state and the 2–8 limit server-side |
| Register PDF is generated entirely in the browser and never stored/logged | Avoids creating a second copy of attendance data and keeps export available without a server job |
| Register marks `late` as present (`pr`) and missing rows as absent (`ab`) | The lecturer register uses the four existing final statuses; `prf` is reserved for geofence-flagged check-ins |
| A ninth session is blocked in both the UI and the RPC | Prevent oversized tables and make the server the final authority on the 2–8 contract |
| Sandbox module was isolated in earlier phases | Current burst work updates sandbox capture and adds descriptor validation without touching real attendance rows |
| Remove raw lat/long coordinates from StudentHome location card; show accuracy and Good/Fair/Poor flag only | Privacy & UX; raw numbers clutter the mobile UI and run counter to privacy reassurance ("Coordinates stay on this device"). Device fix accuracy and the threshold quality flag are all that matter to the student |
| Use SECURITY DEFINER for role checks in RLS | Avoid recursion when policies query profiles/courses; restore proper access for all roles |
| Remove devices dependency from check-in | Table doesn't exist; simplify RPC and drop unused column |
| Make face/attendance errors specific | Better UX - students know why check-in failed (face no-match, accuracy, geofence) |
| Replace client-computed `1 - distance` confidence with a server-calibrated score/band | The stored confidence must not be client-authored; the database derives it from a versioned config and only stores the rounded display source |
| Keep the 8-argument check-in RPC for OTP/manual and add a 9-argument face RPC | Preserves the existing non-face path and makes the unscored face path impossible |
| A face `retry` outcome writes no attendance row; `review` writes a flagged row | Prevents low-confidence attempts from becoming attendance while preserving a human-review trail |
| Store `match_distance` but never display it; show only a rounded 10–90 match confidence | Distance is a calibration input, not a user-facing number; rounding avoids false precision |
| Bands: accept ≥ 80%, review 60–80%, retry < 60% | Chosen by the project owner from the calibrated curve (d < ≈0.474 accept, ≈0.474–0.523 review); review check-ins are flagged for the lecturer, retries write no row |
| Calibration constants are interim and provisional | Fitted on a small pilot; stored in `face_match_config` with `config_revision` and audit log so they can be refitted without a deploy |
| Keep one comma-separated `flag_reason` instead of adding a second flag column | Reuses the existing schema and lets location and face-review reasons coexist (`low_accuracy_overlap,face_review`) |
| Consent stored on `profiles` (not a separate table) | Single source of truth; consent columns protected by trigger so only `record_consent` RPC can write them |
| Account deletion anonymises attendance instead of deleting rows | Preserves class statistics while breaking the link to the deleted student; `student_id` made nullable |
| Deletion RPC runs as SECURITY DEFINER and deletes `auth.users` | Ends the sign-in session; if `auth.users` deletion is not permitted on a given project, an Edge Function fallback using `auth.admin.deleteUser` is required |
| Lecturer manual mark via lecturer-only RPC with audit | Students cannot self-mark as `manual`; lecturers mark present only after seeing the student in the room; no face match or location check on the lecturer's mark; audit row carries session_id only |
| Students cannot send `p_method = 'manual'` | Both `_check_in_attendance` and the 8-arg `check_in_attendance` raise `manual_not_allowed`; OTP path unchanged |
| History: counts not percentages, enrolment date = `enrollments.created_at` (Africa/Blantyre) | The register-style summary uses counts (`Present X of Y ended sessions`; late/flagged count as present) rather than percentages, keeping the UI honest about small denominators |
| History: derivation rules (record → status; completed-no-record → absent; ongoing → live; scheduled → upcoming; cancelled excluded; pre-enrolment sessions excluded unless a record exists) | Single source of truth for `result` on both student and lecturer history, matching the register codes (`pr`/`prf`/`ab`) |
| History: lecturer sessions list + students pages instead of a lecturer History tab | A lecturer tab would duplicate the student model; instead `/dashboard/sessions` (all sessions) and `/dashboard/students` + `/dashboard/students/:id` serve the lecturer's review workflow |
| History: no match scores, distances, accuracy or coordinates anywhere in the UI | Lecturers see only register-code statuses and method; sensitive match fields never leave the database |
| History output columns exclude sensitive fields | All six migration-36 functions return only session/student identifiers and result/method; no `flag_reason`, `match_*`, `location_*` or `confidence_score` columns |
| History: students page loads list on mount, filters client-side, capped at 1000 server-side | `/dashboard/students` fetches all of the lecturer's students once via `list_my_students()` (LIMIT 1000) and filters with the pure `filterStudents` helper — no server call while typing, no debounce, no 2-character minimum; capped at 50 rendered rows with "Show more" |
| Register PDF verification (QR) | Client generates a 6-char code from a 32-symbol alphabet (no I/O/0/1, `crypto.getRandomValues`, `byte & 31` no modulo bias); the code is registered through the lecturer-owned `record_attendance_pdf` RPC before the PDF is built; `verify_attendance_pdf` is public (anon + authenticated) and returns only `course_code`, `course_name`, `created_at`; the verify page `/verify/:code` is public; the QR points to `VITE_PUBLIC_APP_URL`/verify/<code>. Known limitation: proves the code was issued by Class-BARS, not that the PDF content was unedited afterwards. |

---

## 6. Known issues / follow-ups

1. **Register export spot-check** — migration 15 is applied; the PDF download should still be checked on a real lecturer account.
2. **`scripts/reset_supabase_project.sql` is missing migrations 10–33** — it still builds base, 01, 02, 04–09. Do not use it to rebuild a project until it is updated.
3. **Migration 32 is applied; constraints are `NOT VALID` until `32_face_descriptor_validation_validate.sql` is run** — existing rows are not scanned until `VALIDATE`.
4. **Migration 33 is applied** — `tests/sql/face_match_confidence_checks.sql` and `tests/sql/geofencing_checks.sql` are available for re-checks. The migration is hardened with `config_revision` traceability, score clamping, `lock_timeout`/`statement_timeout`, `FOR UPDATE` on the config row, admin-only config RLS, and match-field stripping from the student check-in JSON. PostgREST overload resolution (8-arg OTP/manual vs 9-arg face) is confirmed working.
5. **Face distance is client-supplied** — the server now derives the score, but it cannot prove the descriptor comparison happened on a genuine camera. Treat match confidence as a review signal, not proof of liveness.
6. **`tests/schema.test.ts` fails** — stale `table_state.json` snapshot; regenerate against the live applied schema. The full `node --test tests/*.test.ts` run also reports the pre-existing `rolePolicy` fixture/env failures; the targeted register tests pass.
7. **Hardware device verification** — while validated via unit tests, lint, and build, live end-to-end device testing with live PostGIS proximity and mobile camera face-matching should be verified on physical devices. The browser PDF download should be spot-checked on a real lecturer account. The dev-only video-vs-canvas equivalence check has passed; the face-burst quality thresholds remain provisional pending more real phone/desktop results.

8. **Service worker status** — no service worker is registered and there is no PWA/offline implementation; face capture, check-in and the register PDF run in the browser as a standard SPA.
9. **OTP/manual path bypass** — the 8-argument check-in RPC accepts `p_method = 'otp'` from the client without proving an OTP was verified; `p_method = 'manual'` is now rejected with `manual_not_allowed` (migration 35). Planned fix: require a verified `otp_codes` row for `otp`.
10. **Face template update/delete rules not enforced** — `FaceBiometricsCard` still lets a student add/update/remove their template freely; rules (e.g. re-enrolment limits or lecturer/admin approval) are not yet defined or enforced server-side.
11. **OTP Edge Functions are not in the repo** — `send-attendance-otp`/`verify-attendance-otp` exist only in Supabase; download with the Supabase CLI and commit them.
12. **Migration 34 not applied** — consent columns, `record_consent`, `delete_my_account`, and consent enforcement on face enrolment/check-in are not live until migration 34 (backup → 34 → tests) is applied on a Supabase branch. `auth.users` deletion inside `delete_my_account` should be verified on a branch; if it fails, use an Edge Function fallback.
13. **`table_state.json` referenced by `tests/schema.test.ts` does not exist** — the file is `table_state.md`; the test reads `table_state.json` and will fail until a JSON snapshot is generated.
14. **Migration 35 not applied** — `get_session_enrolled_students`, `lecturer_mark_present`, and consent enforcement on `manual` check-in are not live until migration 35 is applied on a Supabase branch, then `tests/sql/lecturer_manual_mark_checks.sql` is run.
15. **Migration 37 not applied** — `attendance_pdfs`, `record_attendance_pdf`, `verify_attendance_pdf` are not live until migration 37 is applied on a Supabase branch, then `tests/sql/attendance_pdf_checks.sql` is run. The QR proves a code was issued by Class-BARS; it does not prove the PDF content was not edited afterwards. `VITE_PUBLIC_APP_URL` must be set to the production URL or QR codes point at `localhost`.


---

## 7. Files changed in recent phases

### 7.1 Attendance register export (`current`)

```
migrations/15_course_register_data.sql    # NEW — APPLIED — lecturer-only 2–8 session register RPC
src/lib/registerPdf/buildRegisterMatrix.ts # NEW — status mapping, sorting, missing-row handling, 2–8 validation
src/lib/registerPdf/renderRegisterPdf.ts  # NEW — lazy landscape A4 jsPDF/autotable register + filename
src/pages/LecturerCourses.tsx             # UPDATED — per-course Export register dialog, month/session selection
tests/registerPdf.test.ts                 # NEW — 8 matrix builder tests
package.json                              # UPDATED — jspdf + jspdf-autotable
package-lock.json                         # UPDATED — PDF dependency tree
PROGRESS.md                               # UPDATED — documented register export, verification and migration 15
```

### 7.2 Face burst capture (`current`)

```
src/lib/faceCapture.ts                    # UPDATED — burst/quality constants, failure reasons, interval/status helpers
src/lib/faceCompare.ts                    # UPDATED — descriptor validation, averaging, median distance, zero-norm rejection
src/lib/faceQuality.ts                    # NEW — brightness, sharpness, 68-point pose and quality gate
src/lib/faceBurst.ts                      # NEW — canvas burst capture, metrics, dev equivalence check
src/hooks/useFaceDetection.ts             # UPDATED — preview + burst lifecycle, visibility/inactivity cleanup
src/components/face/FaceCaptureFrame.tsx  # UPDATED — static oval, status overlay, debug readout
src/components/face/FaceEnrollCard.tsx    # UPDATED — burst descriptor save + retry
src/components/face/FaceVerifyCard.tsx    # UPDATED — burst median distance + OTP gating
src/pages/StudentHome.tsx                 # UPDATED — consumes burst distance, validates descriptor
src/pages/SandboxStudent.tsx              # UPDATED — sandbox onboarding/verification use burst
src/pages/FaceTest.tsx                    # UPDATED — burst diagnostic page, admin-only
src/pages/FaceVerify.tsx                  # UPDATED — in-memory burst register/verify, no localStorage
src/App.tsx                               # UPDATED — /face-test and /face-verify admin-only
src/lib/realAttendance.ts                 # UPDATED — descriptor/distance validation before RPC
src/lib/sandbox.ts                        # UPDATED — descriptor validation before upsert
src/lib/faceStorage.ts                    # DELETED — localStorage descriptor storage removed
migrations/32_face_descriptor_validation.sql          # NEW — APPLIED — safe validators + NOT VALID CHECKs
migrations/32_face_descriptor_validation_backup.sql   # NEW — backup tables
migrations/32_face_descriptor_validation_preflight.sql # NEW — invalid-row report
migrations/32_face_descriptor_validation_validate.sql # NEW — VALIDATE constraints
migrations/32_face_descriptor_validation_rollback.sql # NEW — drop constraints/functions
tests/faceCapture.test.ts                 # UPDATED — burst constants, interval and status tests
tests/faceCompare.test.ts                 # UPDATED — descriptor validation/combination tests
tests/faceQuality.test.ts                 # NEW — pose, brightness, sharpness and quality-gate tests
tests/sandbox.test.ts                     # UPDATED — valid descriptor fixtures + invalid-input test
tests/realAttendance.test.ts              # UPDATED — zero-norm parse test
tests/schema.test.ts                      # UPDATED — migration 32 static checks
```

### 7.3 Earlier geofencing / location privacy phase

```
src/pages/StudentHome.tsx                # UPDATED — removed raw lat/long display, added accuracy + Good/Fair/Poor status badge, dark mode support
PROGRESS.md                              # UPDATED — prior phase refresh (2026-10-25), location privacy & applied migrations
migrations/08_course_lecturer.sql        # APPLIED — course owner-scoped policies & lecturer_id FK
migrations/10_staff_email_allowlist.sql  # APPLIED — staff_emails exact-email allowlist
migrations/11_admin_section_rls.sql      # APPLIED — RLS for admin CRUD
migrations/12_geofencing.sql             # APPLIED — PostGIS circle/box geofences, gap check, flagged attendance
src/lib/geofence.ts                      # UPDATED — bounds, box ordering/validation, half-size, geolocation + block messages
src/components/admin/VenueGeofenceMap.tsx # UPDATED — circle/box map, draggable corners, live polygon
src/pages/AdminDashboard.tsx             # UPDATED — circle/box tabs, corners, small-fence notice, RPC save, fence delete
src/pages/SessionLive.tsx                # UPDATED — flag reason on flagged roster rows
src/lib/realAttendance.ts                # UPDATED — 8-arg check-in RPC with location
src/types/db.ts                          # UPDATED — GeofenceRow, venue geofence_id, attendance flag/location fields
tests/geofence.test.ts                   # UPDATED — bounds, box ordering/validation, half-size, pasted pairs
tests/sql/geofencing_checks.sql          # UPDATED — circle/box schema, RLS, RPC, decision table (rolls back)
README.md                                # UPDATED — migration order, geofencing, test instructions
src/contexts/AuthContext.tsx              # UPDATED — signInWithOtp (magic link), signUp captchaToken
src/lib/guardPolicy.ts                    # UPDATED — homeFor maps admin→/admin; fallbacks /profile→/login
src/lib/nav.ts                            # UPDATED — ADMIN_NAV (Home, Venues, Users & Roles, System Logs)
src/lib/rolePolicy.ts                     # UPDATED — staff_emails exact-email allowlist
src/pages/AdminDashboard.tsx              # NEW — Home/Venues/Users&Roles/System Logs, sidebar-driven
src/pages/AdminLogin.tsx                  # NEW — magic-link only, no password, no signup
src/components/AdminRoute.tsx             # NEW — fail-closed guard for /admin (role="admin")
src/components/GuestRoute.tsx             # NEW — guest-only route guard for /login and /signup
src/pages/Login.tsx                       # UPDATED — /profile→/login fallback, captcha via useCaptcha
src/pages/Onboarding.tsx                  # UPDATED — /profile→/login fallback
src/components/Navbar.tsx                 # UPDATED — dashboardPath fallback /profile→/login
src/App.tsx                               # UPDATED — /profile route removed; /admin routes added
src/pages/Profile.tsx                     # DELETED — standalone profile page removed
src/hooks/useCaptcha.ts                   # NEW — shared captcha gate wiring
```

### 7.4 Server-computed face match confidence (`current`)

```
migrations/33_face_match_confidence.sql          # UPDATED — hardened: config_revision, clamping, lock timeout, FOR UPDATE, admin-only config RLS, match-field stripping
migrations/33_face_match_confidence_backup.sql   # UPDATED — transaction, fresh backups, match-row copy, revokes
migrations/33_face_match_confidence_rollback.sql # UPDATED — transaction, revokes before drop, IF EXISTS
tests/sql/face_match_confidence_checks.sql       # UPDATED — revision, validation, stripping, prerequisites, RLS
src/lib/faceMatch.ts                             # NEW — rounded 10–90 match-confidence display helper + tooltip
tests/faceMatch.test.ts                          # NEW — rounding, clamping, invalid-score tests
src/lib/realAttendance.ts                        # UPDATED — structured face result, match_score roster field (confidence_score removed)
src/types/db.ts                                  # UPDATED — attendance match columns
src/components/face/FaceVerifyCard.tsx           # UPDATED — server outcome flow, no local distance display
src/components/face/FaceCaptureFrame.tsx         # UPDATED — raw distance/stat readout removed
src/pages/StudentHome.tsx                        # UPDATED — accept/review/retry handling, OTP after two failures, face_distance_required and update-app messaging
src/pages/SessionLive.tsx                        # UPDATED — rounded match confidence + formatted flag reasons
src/pages/FaceVerify.tsx                         # UPDATED — raw distance/threshold badges removed
src/pages/FaceTest.tsx                           # UPDATED — distance/attempt debug fields removed
src/pages/SandboxStudent.tsx                     # UPDATED — raw distance badge removed
src/lib/faceBurst.ts                             # UPDATED — distance removed from debug logs
src/lib/geofence.ts                              # UPDATED — generic flagged message
src/lib/registerPdf/renderRegisterPdf.ts         # UPDATED — generic prf legend
PROGRESS.md                                      # UPDATED — pipeline corrected, migrations 32/33 applied, calibration documented
README.md                                        # UPDATED — migration order, deploy order, service-worker status, flag_reason/RLS evidence
table_state.md                                   # UPDATED — match columns, config table and policy
```

### 7.5 Consent + account deletion (migration 34)

```
migrations/34_consent_and_account_deletion.sql          # NEW — NOT APPLIED — consent columns, trigger, record_consent, delete_my_account, consent enforcement on face enrolment/check-in
migrations/34_consent_and_account_deletion_backup.sql   # NEW — NOT APPLIED — transaction, fresh profiles/attendance backups, revokes
migrations/34_consent_and_account_deletion_rollback.sql # NEW — NOT APPLIED — drops trigger/functions, restores RPCs (consent columns NOT dropped — irreversible)
tests/sql/consent_and_deletion_checks.sql               # NEW — direct consent UPDATE blocked, INSERT preset blocked, record_consent/idempotent/bad-version/non-student, face enrolment/check-in consent_required, OTP/manual without consent, delete_my_account rejects lecturer/admin/anon, delete_my_account anonymises attendance, get_session_attendance/get_register_data work with anonymised rows
src/lib/consent.ts                                       # NEW — CONSENT_VERSION, DATA_CONTACT_EMAIL, hasCurrentConsent/hasAnyConsent/canUseFace/needsConsent/formatConsentDate
src/lib/account.ts                                       # NEW — recordConsent, deleteMyAccount, AccountError
src/components/dashboard/ConsentCard.tsx                 # NEW — full consent text verbatim, checkbox + "I consent" button, loading/error/success states
src/components/dashboard/DangerZoneCard.tsx              # NEW — destructive styling, confirm Dialog (full-screen on phones), DELETE-input validation, sign out + navigate on success
src/pages/StudentProfile.tsx                             # UPDATED — ConsentCard above FaceBiometricsCard, DangerZoneCard below
src/pages/StudentHome.tsx                                # UPDATED — consent banner, face verify gated behind consent, consent-recorded event listener
src/components/dashboard/FaceBiometricsCard.tsx          # UPDATED — enrolment gated behind consent, shows "Record your consent above before enrolling your face."
src/pages/Onboarding.tsx                                 # UPDATED — consent step before face enrolment for students
src/lib/consent.test.ts                                  # NEW — unit tests for consent.ts helpers
tests/schema.test.ts                                     # UPDATED — static checks for migration 34
src/types/db.ts                                          # UPDATED — consent_given_at, consent_version on ProfileRow
PROGRESS.md                                              # UPDATED — consent + account deletion phase
README.md                                                # UPDATED — migration order, deploy order
table_state.md                                           # UPDATED — consent columns, trigger, new/modified RPCs
```

### 7.6 Lecturer manual mark (migration 35)

```
migrations/35_lecturer_manual_mark.sql          # NEW — NOT APPLIED — get_session_enrolled_students, lecturer_mark_present, manual_not_allowed rejection in _check_in_attendance and 8-arg check_in_attendance
migrations/35_lecturer_manual_mark_rollback.sql # NEW — NOT APPLIED — drops new functions, restores pre-35 _check_in_attendance and 8-arg check_in_attendance
tests/sql/lecturer_manual_mark_checks.sql       # NEW — owner can list/mark, other lecturer/student/admin/anon rejected, scheduled/completed/cancelled rejected, unenrolled student rejected, duplicate mark raises 'already recorded', already-checked-in shows true, audit row has no student identifiers, 8-arg RPC rejects 'manual' but accepts 'otp', roster shows manual mark
src/lib/manualMark.ts                           # NEW — getSessionEnrolledStudents, lecturerMarkPresent wrappers, ManualMarkError
src/lib/studentSearch.ts                        # NEW — filterStudents helper (trim, lowercase, multi-word, limit, unchecked-first sort)
tests/studentSearch.test.ts                     # NEW — unit tests for filterStudents
src/pages/SessionLive.tsx                       # UPDATED — manual mark card visible when session ongoing, search input with debounce, enrolled list fetched once + refreshed after mark, confirmation dialog (Cancel-focused, in-flight disabled), roster shows Manual badge
tests/schema.test.ts                            # UPDATED — static checks for migration 35
README.md                                       # UPDATED — migration order, deploy order
table_state.md                                  # UPDATED — new/modified RPCs for migration 35
PROGRESS.md                                     # UPDATED — manual mark phase
```

### 7.7 Verifiable attendance register PDFs (QR codes) (migration 37)

```
migrations/37_attendance_pdfs.sql               # NEW — BUILT, NOT APPLIED — attendance_pdfs table, record_attendance_pdf + verify_attendance_pdf RPCs
migrations/37_attendance_pdfs_rollback.sql      # NEW — BUILT, NOT APPLIED — drops functions and table
tests/sql/attendance_pdf_checks.sql             # NEW — SQL checks (rolls back)
tests/schema.test.ts                            # UPDATED — static checks for migration 37
src/lib/registerPdf/pdfCode.ts                  # NEW — generatePdfCode, normalisePdfCode, isValidPdfCode, buildVerifyUrl
src/lib/registerPdf/pdfActions.ts               # NEW — recordAttendancePdf, registerPdfWithRetry
src/lib/registerPdf/verifyPdf.ts                # NEW — verifyAttendancePdf wrapper
src/lib/registerPdf/renderRegisterPdf.ts        # UPDATED — QR on first page, header shift, footer verification code, async
src/lib/registerPdf/buildRegisterMatrix.ts      # UNCHANGED
src/pages/LecturerCourses.tsx                   # UPDATED — register code before PDF, pass code to download
src/pages/VerifyPdf.tsx                         # NEW — public verify page
src/App.tsx                                     # UPDATED — /verify/:code public route
tests/pdfCode.test.ts                           # NEW — code generation/normalisation/URL tests
tests/verifyPdf.test.ts                         # NEW — verify status mapping tests
package.json                                    # UPDATED — qrcode + @types/qrcode
package-lock.json                               # UPDATED — QR dependency tree
README.md                                       # UPDATED — migration order, deploy order, VITE_PUBLIC_APP_URL
table_state.md                                  # UPDATED — attendance_pdfs table, new RPCs
PROGRESS.md                                     # UPDATED — decisions log, section 2.14, section 7.7, known issue
```

---

### 3.8 Audit logs: actor email + four new event types (BUILT, NOT APPLIED)

- `migrations/38_audit_log_actor_and_events_{backup, ,rollback}.sql` (migration 38 — NOT applied to the database; migrations 34 and 35 must follow it):
  - `public.write_audit_log(action, entity_type, entity_id, metadata, actor_id)` — the single SECURITY DEFINER audit-write helper (`set search_path = public`); EXECUTE revoked from public/anon/authenticated and never granted, so clients cannot call it and cannot insert into audit_logs directly (audit_logs stays select-only for clients, no INSERT/UPDATE/DELETE policies). `user_agent` stores ONLY the real user agent (truncated to 512 chars) — the actor email is NOT stored in user_agent; it is resolved separately from the actor's `user_id`. IP read from `current_setting('request.headers', true)` inside an exception-guarded block, NULL when absent (triggers/cron).
  - `public.get_user_emails(p_user_ids uuid[])` — SECURITY DEFINER RPC that reads `auth.users.email` server-side; EXECUTE granted to `authenticated`, revoked from `public`/`anon`. Used by the audit-log UI to map `user_id` → email.
  - Four AFTER triggers, each wrapping the audit write in an exception handler (RAISE WARNING) so logging can never block the underlying operation:
    - `trg_audit_session_started` on `public.class_sessions` (INSERT into `ongoing`); actor = session lecturer; metadata = course_id, venue_id only; entity_type `class_session`.
    - `trg_audit_session_status_ongoing` on `public.class_sessions` (UPDATE where status changes INTO `ongoing`); actor = session lecturer; metadata = course_id, venue_id only; entity_type `class_session`.
    - `trg_audit_account_created` on `public.profiles`; actor = new user; metadata = role only (no biometric data); entity_type `profiles`.
    - `trg_audit_venue_created` on `public.venues`; actor = auth.uid(); metadata = venue name only; entity_type `venues`.
    - `trg_audit_lecturer_email_added` on `public.staff_emails`; actor = auth.uid(); metadata = the added email; entity_type `staff_email`.
  - Index `idx_audit_logs_action_created_at` on `(action, created_at desc)` for the audit page ordering/filtering.
  - Migrations 34 (`consent.recorded`, `account.deleted`) and 35 (`attendance.manual_marked`) refactored to write audit_logs through `write_audit_log` instead of direct inserts — one write path. Apply 38 before 34/35.
- Frontend (`src/pages/AdminDashboard.tsx`): System Logs page now does server-side pagination (count + ranged select, 50/page, newest first), selects only needed columns, shows a "User email" column resolved from each row's `user_id` via `get_user_emails` (rendered small font via `text-xs`, plain text, "—" when the account was deleted / user_id is null); the parsed "User" column and the "User agent" column are removed. Admin-only enforcement via the existing AdminRoute is unchanged. No action label map existed, so the four actions render as plain text.
- `src/types/db.ts`: added `AuditLogRow`.
- Verification: `tsc -b` clean, ESLint on changed files clean. Vite production build could not run in this shell (node_modules carries only the Windows `@rolldown` binding — pre-existing environment issue, unrelated to this change).

### 3.9 Admin captcha: reverted (NOT APPLIED)

- `migrations/39_admin_magic_link_rpc_{,rollback}.sql` — migration 39 files exist but were NOT applied. Abandoned `pg_net`-based RPC approach.
- Frontend reverted to original captcha-free admin login:
  - `src/contexts/AuthContext.tsx`: `signInWithOtp` uses plain `supabase.auth.signInWithOtp({ email })` (no captcha param).
  - `src/pages/AdminLogin.tsx`: No `<CaptchaGate>`, no captcha token, no captcha gating. Calls `signInWithOtp(email)` directly.
- Verification: `tsc -b` clean, ESLint on changed files clean.

**The captcha 400 error is a Supabase server-side config issue, not a client code issue.** Supabase is rejecting `signInWithOtp` without a captcha token, meaning captcha is enforced at the project level despite the dashboard toggle appearing disabled. To fix, disable captcha at Supabase Dashboard → Authentication → Settings → Captcha (and any provider-specific captcha toggles), then restart the project. No client-side code change can bypass a server-side captcha requirement without a valid token.

---

### 3.10 Student registration number lock (migration 40)

- `migrations/40_student_number_lock_backup.sql` — snapshot of `public.profiles` before the lock is added.
- `migrations/40_student_number_lock.sql` — `public.profiles_guard_student_number()` BEFORE UPDATE trigger function + `trg_protect_profiles_student_number` trigger on `public.profiles`, plus `public.update_my_profile(p_full_name, p_phone_number, p_student_number)` SECURITY DEFINER RPC.
  - **Trigger:** locks `student_number` once it holds a value — if `OLD.student_number` is non-blank and `NEW.student_number` differs, raises `Registration number is locked`. Only enforced when `auth.uid()` IS NOT NULL; service-role and SQL-editor sessions (`auth.uid()` is null) may correct a mistaken value (administrator route). Normalises new values (btrim + upper), rejects empty-after-trim and values > 30 chars.
  - **RPC `update_my_profile`:** SECURITY DEFINER, `search_path = public`, EXECUTE granted to `authenticated` only. Operates only on `auth.uid()`'s own row. Validates `full_name` (trimmed, 2–100 chars) and `phone_number` (trimmed, empty→NULL, otherwise 7–20 chars from digits/spaces/+/-). Updates full_name and phone_number always. Sets `student_number` only when the existing value is NULL/blank AND a non-blank value is passed (normalised as above); if a value already exists and a different one is passed, raises `Registration number is locked`; same value ignored. Student role only for `student_number`; other roles ignore it. Maps `unique_violation` to `This registration number is already registered`. Writes `audit_logs` rows: `profile_updated` (changed field names only, no values) and `student_number_set` (one time). Returns the updated profile row.
- `migrations/40_student_number_lock_rollback.sql` — drops the trigger, function and RPC.
- `src/components/dashboard/ProfileSettings.tsx` — uses `update_my_profile` RPC instead of direct `profiles.update()`. Registration number editable (with confirm dialog "Save registration number? — you will not be able to change this later") when empty; read-only with note once set. Name and phone always editable. Inline errors for validation, locked and duplicate messages. Reloads after success.
- `src/pages/StudentHome.tsx` — dashboard banner "Add registration number in profile" (amber-styled, same as the consent banner), shown after the consent banner and only for students whose `student_number` is NULL/blank once the profile has loaded (no flash while loading). Points to `/student/profile`. Informational only — does not block any feature.
- Depends on migration 38 (`public.write_audit_log()` must exist).
- **NOT applied to the database** — run backup → main → tests on a Supabase branch/staging project first.

---

## 6. Known issues / follow-ups
