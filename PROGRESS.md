# Class-BARS Progress Report

**Date:** 2026-09-09
**Repo:** `D:\classBars\class-bars`
**Overall status:** Real (DB-backed) attendance flow is built end-to-end and verified by lint/build/tests. Both lecturer and student sides now share one dashboard (collapsible sidebar + stat cards). Sandbox remains untouched. Migrations 06–08 and the reset script are written and re-runnable; 06/07 have been applied to the live project, **08 is pending manual execution**.

---

## 1. Status snapshot

| Area | Status | Notes |
|---|---|---|
| Core schema (`class_bars_schema_no_geo.sql`) | Done | Profiles, courses, venues, class_sessions, enrollments, face_embeddings, devices, attendance_records, otp_codes, audit_logs + RPCs |
| Security/policies (`migrations/01`) | Done | Staff policies, hardened `check_in_attendance`, immutability guards |
| Real attendance flow (`migrations/06`) | Applied | `face_embeddings` renamed/self-own policy; SECURITY DEFINER RPCs: `upsert_face_embedding`, `clear_face_embedding`, `enroll_self`, `get_session_attendance`; hardening; grants |
| Real-table GRANTs (`migrations/07`) | **Applied — fixes "permission denied"** | Explicit DML grants to `authenticated`, SELECT to `anon` on real tables + EXECUTE on client RPCs |
| Course ownership (`migrations/08`) | **Scripted — NOT yet executed** | `courses.lecturer_id` FK + owner-scoped create/update policies |
| Signup | Done | Student/Lecturer toggle + hCaptcha; `AuthContext.signUp` accepts `captchaToken` |
| Lecturer dashboard | Done | Collapsible sidebar (Overview, Courses, Update profile, Sign out), stat cards, session live page |
| Student dashboard | Done | Same shell/sidebar, Overview + Courses + Update profile pages, live face check-in |
| New session form | Done | "Start now" vs "Schedule for later" + registration duration (5/15/30/60 min) that auto-computes session end |
| Face pipeline | Done | face-api 0.22.2 (tiny detector/landmarks/recognition, models in `public/models/`), pure math + model-version helpers in `src/lib/faceCompare.ts` |
| Automated tests | 43/44 pass | 1 known pre-existing failure: `tests/schema.test.ts` reads stale `table_state.json` snapshot (row format + column rename); regenerating the snapshot fixes it |
| Sandbox module | Untouched | Intentionally left as-is per user decision |

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

### 2.2 Course ownership
- `migrations/08_course_lecturer.sql` (pending execution): adds `courses.lecturer_id uuid references profiles(id)` (+index), replaces the staff-wide course create/update policies with owner-scoped ones (admin exception). Existing rows keep `lecturer_id NULL`; legacy courses won't show in "My courses" until an admin reassigns them.
- Client: `LecturerCourses` assigns `lecturer_id = user.id` on create and lists only own courses; `NewSession` course dropdown filters to owned courses.

### 2.3 Signup rework
- `src/pages/Signup.tsx`: segmented Student/Lecturer toggle (labels, submit text, and redirect adapt), hCaptcha required before submit (resets on error/role switch), lecturer → `/dashboard`, student → `/onboarding`.
- `AuthContext.signUp` gained an optional `captchaToken` forwarded to `signUp({ options: { captchaToken } })`.

### 2.4 Lecturer dashboard
- `src/components/DashboardShell.tsx`: collapsible sidebar (desktop pin to icon-only, persisted to localStorage; slide-over drawer on mobile) with brand + role badge, nav, and bottom Sign out. Nav routes in `src/lib/nav.ts` (`LECTURER_NAV` / `STUDENT_NAV`).
- `src/components/dashboard/StatCard.tsx` shared card: icon chip, uppercase label, big number, hint row, optional emerald live-pulse.
- `LecturerDashboard`: greeting + 4 stat cards (Total sessions, Live now w/ pulse, Upcoming, Courses taught) + Recent sessions (pulse on ongoing rows, Start/End/Cancel actions).
- `SessionLive` (`/dashboard/sessions/:id`): start/end/cancel, polled roster (3 s) with method/status badges and confidence %, all inside the same shell.
- `LecturerProfile` (`/dashboard/profile`) uses a shared `ProfileSettings` editor.

### 2.5 Student dashboard
- Same `DashboardShell` (role label "Student dashboard", `STUDENT_NAV`):
  - Overview (`/student`): greeting, stat cards (Live now, Checked in today, Total check-ins, Face ready), live-class cards with pulsing "Live" badge → single-shot face verify → "You're checked in" confirmation.
  - Courses (`/student/courses`): My courses + enroll-in-catalog with stat cards (Enrolled / Available).
  - Update profile (`/student/profile`): shared `ProfileSettings` (student/staff field chosen by loaded role).
- Face setup still lives on the dedicated `/profile` face dashboard; onboarding unchanged → `/profile`.

### 2.6 New session form
- Segmented control: **Start now** vs **Schedule for later**.
- **Registration duration** (5/15/30/60 min) replaces the manual end-time picker; end = start + duration, previewed live ("Starts now · ends at … · registration open for 30 min").
- Start now: inserts the session already `ongoing` with `actual_start` set and navigates to the live attendance page. Schedule: validates a future start, inserts `scheduled`.

### 2.7 Face recognition pipeline
- face-api 0.22.2; detection options `TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 })`; hook must call `withFaceLandmarks(true)` for the tiny-landmark net; `public/models/` complete.
- Model version pins template compat: stale templates (version mismatch) are rejected client-side and prompted for re-enrollment.

---

## 3. Earlier phase — sandbox / demo + auth (history)

- Sandbox built per `CLASS-BARS_SANDBOX_MODULE_SPEC.md`, **Option B** (fully separate `sandbox_sessions` / `sandbox_checkins` / `sandbox_participants`, no writes to real tables), identity via Supabase Anonymous Sign-ins, polling instead of Realtime. Sandbox student flow is 2-step: onboard (name + face) once per UID, then live-verify to check in.
- hCaptcha gates sandbox join + login (sitekey in `.env`, secret only in dashboard; dev-safe when key absent).
- Database drift cleanup: `migrations/03_table_details.sql` (read-only report), `migrations/04_sandbox_profile_exclusion.sql` (hardened `handle_new_user`, awaits execution), `scripts/reset_supabase_project.sql` (destructive full reset rebuilding from tracked files — chain runs 01, 02, 04, 05, 06, 07, 08; skips the 03 report).
- `migrations/02` rewritten fully idempotent.

---

## 4. Decisions log (latest)

| Decision | Rationale |
|---|---|
| Face template stored as plaintext `embedding_json` (column renamed) | Template is app data; combine with RLS self-ownership instead of app-layer encryption |
| Self-serve `enroll_self` RPC | Lets students enroll in any course by code without lecturer action |
| Face as the check-in credential (method `face`, confidence `1-distance`) | Reuses existing face-api pipeline; no OTP device pairing needed for the demo |
| Course now owned by the creating lecturer (`lecturer_id`) | "Courses you schedule" scoped per lecturer; dropdowns show only own courses |
| One shared `DashboardShell` + `StatCard`/`ProfileSettings` for both roles | Guarantees the student dashbooard is visually consistent with the lecturer's |
| Start-now sessions insert as `ongoing` directly (no RPC) | `start_session` RPC is unnecessary when the insert policy already binds to `auth.uid()` |
| Single "registration duration" select drives end time | Simpler UX than free-form end pickers; matches 5/15/30/60-minute class windows |
| Sandbox module left untouched throughout | Explicit user instruction; all new work is on the real tables |

---

## 5. Known issues / follow-ups

1. **Execute `migrations/08_course_lecturer.sql`** in the Supabase SQL Editor (06/07 already applied). Legacy courses keep `lecturer_id NULL` until an admin reassigns them.
2. **`tests/schema.test.ts` fails (pre-existing, 1 of 44):** it compares against `tests/table_state.json`, whose row format no longer matches (also stale after the column rename). Regenerate the snapshot.
3. **Camera/DB verification is manual:** nothing here runs a live camera or hits the live project — validated via lint + build + tests only.
4. **Bundle size:** production chunk >500 kB from `face-api.js`; consider dynamic import / code-splitting.
5. **Face threshold:** `isMatch` uses strict `<` vs 0.6; exactly-at-threshold pairs reject. Revisit when tuning FAR/FRR.
6. **Phase-2 scope (non-goals):** geofencing (PostGIS) and OTP fallback intentionally unbuilt.
7. **Edge functions:** repo tracks none; any on the live project predate this repo — port or delete.
8. **Pre-existing real users with wrong stored role:** migration 04 fixes new signups only; earlier lecturers need a guarded repair.
9. **Dev-server quirk:** the Vite script runs the Windows `node.exe`; use Windows `curl.exe` and `--strictPort` when probing.

---

## 6. Files changed in the latest phase

```
migrations/06_real_attendance_flow.sql      # NEW — real face embeddings + enroll/roster RPCs
migrations/07_real_table_grants.sql         # NEW — explicit GRANTs (fixes "permission denied")
migrations/08_course_lecturer.sql           # NEW — courses.lecturer_id + owner policies (PENDING)
scripts/reset_supabase_project.sql          # UPDATED — chain now includes 05-08
src/lib/faceCompare.ts                      # NEW — pure match math + FACE_MODEL_VERSION
src/lib/nav.ts                              # NEW — LECTURER_NAV / STUDENT_NAV
src/components/DashboardShell.tsx           # NEW — collapsible sidebar shell (replaces LecturerShell/StudentShell)
src/components/dashboard/StatCard.tsx       # NEW — shared stat card
src/components/dashboard/ProfileSettings.tsx# NEW — shared profile editor
src/components/face/FaceCaptureFrame.tsx    # NEW
src/components/face/FaceEnrollCard.tsx      # NEW
src/components/face/FaceVerifyCard.tsx      # NEW
src/pages/LecturerDashboard.tsx             # REWRITTEN — stat cards + unified shell
src/pages/LecturerCourses.tsx               # UPDATED — owner-scoped courses
src/pages/LecturerProfile.tsx               # REWRITTEN — thin wrapper over ProfileSettings
src/pages/NewSession.tsx                    # REWRITTEN — start-now/schedule + duration
src/pages/SessionLive.tsx                   # UPDATED — unified shell
src/pages/StudentHome.tsx                   # REWRITTEN — student Overview dashboard
src/pages/StudentCourses.tsx                # NEW — /student/courses
src/pages/StudentProfile.tsx                # NEW — /student/profile
src/pages/Signup.tsx                        # REWRITTEN — role toggle + hCaptcha
src/contexts/AuthContext.tsx                # UPDATED — signUp captchaToken
src/types/db.ts                             # UPDATED — CourseRow.lecturer_id
src/App.tsx                                 # UPDATED — /student/courses, /student/profile, /dashboard/profile
tests/realAttendance.test.ts                # NEW
tests/faceCompare.test.ts                   # NEW
tests/loader.mjs                            # FIXED — nested @/ alias file:// double-prefix bug
```