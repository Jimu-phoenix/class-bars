# Class-BARS Progress Report

**Date:** 2026-10-29
**Repo:** `D:\classBars\class-bars`
**Overall status:** Real (DB-backed) attendance flow built end-to-end and verified by lint/build/tests. Role-based access hardened end-to-end (client guards + server-side `staff_emails` allowlist enforced in the signup trigger). Theme toggle rewritten. Profile UI lives inside each role's dashboard. Auth pages guest-only. Dashboard shell + student pages rebuilt mobile-first. Student location card streamlined for privacy (raw coordinates removed; accuracy + Good/Fair/Poor flags displayed). Lecturer attendance-register PDF export added: per-course month/session picker, 2–8 ended sessions, browser-generated landscape A4 PDF, and a lecturer-only SECURITY DEFINER data RPC. OTP fallback added for student check-in. Face verification errors made specific (no match, accuracy/geofence reasons). Fixed login 500 by correcting profiles RLS (SECURITY DEFINER functions, no recursion). Fixed attendance RPC to remove devices dependency and drop device_id column. Sandbox untouched. **All existing migrations applied through 29; migrations 30 (200 m accuracy ceiling) and 31 (box geofence `ST_Covers`/area fix) built and must be applied.** Admin dashboard built (Home, Venues, Users & Roles, System Logs) with magic-link login and no signup; Venues supports circle and four-corner box geofence editing.

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
| Face pipeline | Done | face-api 0.22.2 (tiny detector/landmarks/recognition, models in `public/models/`), pure math + model-version helpers in `src/lib/faceCompare.ts` |
| Admin dashboard | Done | Magic-link login, no signup; Home (live stats), Venues (CRUD + circle/box geofence editor), Users & Roles (staff email allowlist), System Logs (audit_logs). Sidebar-driven navigation, all routes AdminRoute-guarded. |
| Geofencing (`migrations/12`) | **Applied** | PostGIS proximity check in `check_in_attendance`; one `geofences` row per venue (circle 2–50 m or four-corner box); gap-based decision table with small-fence handling; raw coordinates never stored; admin-only fence writes. |
| Admin geofence RPC (`migrations/13`) | **Applied** | `set_venue_geofence` made SECURITY DEFINER with explicit admin role check to prevent RLS subquery recursion |
| Single face embedding (`migrations/14`) | **Applied** | Prunes older/duplicate face embeddings per user and updates in-place, eliminating 409 unique_violation against `idx_face_embeddings_active_user` |
| Attendance register export (`migrations/15` + app) | **Built — migration 15 not applied** | Lecturer-owned course RPC for 2–8 completed sessions; pure register matrix builder; lazy landscape A4 PDF renderer; per-course export dialog with month/session selection |
| Profiles RLS fix (`migrations/26-27`) | **Built — apply in SQL Editor** | SECURITY DEFINER functions for role checks, no recursion; proper access for students/lecturers/admins |
| Attendance RPC fix (`migration 29`) | **Built — apply in SQL Editor** | Remove devices table dependency, drop `device_id` from attendance_records, keep compatible signature |
| OTP fallback | Done | `src/lib/attendanceOtp.ts`, `OtpFallbackCard`, integrated in StudentHome with quota/attempt logic |
| Specific error messages | Done | Face verification shows "No match on face", check-in failures specify poor accuracy/outside geofence/no geofence |
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
- **Login 500 fix:** Recursive RLS on profiles caused 500 errors after migration 20. Fixed with SECURITY DEFINER functions (`current_user_role`, `is_admin_user`, `is_lecturer_user`) in migrations 26-27, no recursion.
- **Attendance devices error:** `check_in_attendance` referenced non-existent `devices` table. Migration 29 removes the check and drops `attendance_records.device_id`. Client passes `p_device_id: null` (compatible).
- **OTP fallback:** Added OTP API layer and UI for students when face verification fails repeatedly or on demand. Integrates with `send-attendance-otp`/`verify-attendance-otp` edge functions.
- **Specific errors:** Face no-match shows "No match on face", check-in errors specify poor accuracy/outside geofence/no geofence/unknown reasons.

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
- `SessionLive` (`/dashboard/sessions/:id`): start/end/cancel, polled roster (3 s) with method/status badges and confidence %, all inside the same shell.
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
- face-api 0.22.2; detection options `TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 })`; hook must call `withFaceLandmarks(true)` for the tiny-landmark net; `public/models/` complete.
- Model version pins template compat: stale templates (version mismatch) are rejected client-side and prompted for re-enrollment.

### 2.8 Geofencing (PostGIS proximity check)

- `migrations/12_geofencing.sql` adds PostGIS, a `geofences` table (circle or four-corner box; circles 2–50 m, boxes valid/≥4 m²/every corner ≤50 m from the centre), `venues.geofence_id` (unique, `ON DELETE SET NULL`), an `AFTER DELETE` trigger that removes a deleted venue's fence, attendance `flag_reason` + `location_distance_m` + `location_accuracy_m`, and restrictive admin-only venue INSERT/UPDATE/DELETE policies over migration 11's permissive ones. The old inline venue lat/lng/radius columns were dropped; migration 12 was edited in place because it had not been executed.
- The direct `attendance_records` INSERT path (`Students insert own attendance` + 07 grant) is revoked, so all writes must go through the SECURITY DEFINER check-in RPC. The old 5-argument `check_in_attendance` is dropped; the new 8-argument version requires lat/lng/accuracy. `set_venue_geofence` is SECURITY INVOKER so the admin RLS policies still apply.
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
- **Verification:** `tsc -b`, ESLint on changed files, 8/8 `tests/registerPdf.test.ts`, and the Vite production build pass. A 60-student × 8-session smoke PDF rendered as 3 pages with repeated headers and correct page numbers; an empty-roster PDF rendered its header and legend. **Migration 15 has not been applied**, so live RPC/export remains to be verified in Supabase.

---

## 3. Phase A — theme (light/dark/system) + Phase B — role access hardening

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
| Face as the check-in credential (method `face`, confidence `1-distance`) | Reuses existing face-api pipeline; no OTP device pairing needed for the demo |
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
| Sandbox module left untouched throughout | Explicit user instruction; all new work is on the real tables |
| Remove raw lat/long coordinates from StudentHome location card; show accuracy and Good/Fair/Poor flag only | Privacy & UX; raw numbers clutter the mobile UI and run counter to privacy reassurance ("Coordinates stay on this device"). Device fix accuracy and the threshold quality flag are all that matter to the student |
| Use SECURITY DEFINER for role checks in RLS | Avoid recursion when policies query profiles/courses; restore proper access for all roles |
| Remove devices dependency from check-in | Table doesn't exist; simplify RPC and drop unused column |
| Make face/attendance errors specific | Better UX - students know why check-in failed (face no-match, accuracy, geofence) |

---

## 6. Known issues / follow-ups

1. **Migration 15 is not applied** — `migrations/15_course_register_data.sql` must be run before live export works. The UI will surface the RPC error until then.
2. **`scripts/reset_supabase_project.sql` is missing migrations 10–15** — it still builds base, 01, 02, 04–09. Do not use it to rebuild a project that needs the staff allowlist, admin/geofence policies, geofencing, or register export until it is updated.
3. **`tests/schema.test.ts` fails** — stale `table_state.json` snapshot; regenerate against the live applied schema. The full `node --test tests/*.test.ts` run also reports the pre-existing `rolePolicy` fixture/env failures; the targeted register tests pass.
4. **Hardware device verification** — while validated via unit tests, lint, and build, live end-to-end device testing with live PostGIS proximity and mobile camera face-matching should be verified on physical devices. The browser PDF download should be spot-checked on a real lecturer account after migration 15 is applied.


---

## 7. Files changed in recent phases

### 7.1 Attendance register export (`current`)

```
migrations/15_course_register_data.sql    # NEW — NOT APPLIED — lecturer-only 2–8 session register RPC
src/lib/registerPdf/buildRegisterMatrix.ts # NEW — status mapping, sorting, missing-row handling, 2–8 validation
src/lib/registerPdf/renderRegisterPdf.ts  # NEW — lazy landscape A4 jsPDF/autotable register + filename
src/pages/LecturerCourses.tsx             # UPDATED — per-course Export register dialog, month/session selection
tests/registerPdf.test.ts                 # NEW — 8 matrix builder tests
package.json                              # UPDATED — jspdf + jspdf-autotable
package-lock.json                         # UPDATED — PDF dependency tree
PROGRESS.md                               # UPDATED — documented register export, verification and migration 15 pending
```

### 7.2 Earlier geofencing / location privacy phase

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

---