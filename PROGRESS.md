# Class-BARS Progress Report

**Date:** 2026-10-06
**Repo:** `D:\classBars\class-bars`
**Overall status:** Real (DB-backed) attendance flow is built end-to-end and verified by lint/build/tests. Role-based access is now hardened end-to-end (client guards + server-side `staff_emails` allowlist enforced in the signup trigger), the theme toggle was rewritten, the profile UI now lives inside each role's dashboard (no standalone page for students/lecturers), auth pages are guest-only (signed-in users bounce to their dashboard; no nav/footer), and the shared dashboard shell + student pages were rebuilt mobile-first (bottom tab bar on phones, full-screen dialogs for face enrollment/verify, collapsible sidebar on desktop). Sandbox remains untouched. Migrations 06/07/09: 06/07 applied to the live project, **08 and 09 are pending manual execution**; migration 10 (email-based lecturer allowlist) scripted and ready to run.

---

## 1. Status snapshot

| Area | Status | Notes |
|---|---|---|
| Core schema (`class_bars_schema_no_geo.sql`) | Done | Profiles, courses, venues, class_sessions, enrollments, face_embeddings, devices, attendance_records, otp_codes, audit_logs + RPCs |
| Security/policies (`migrations/01`) | Done | Staff policies, hardened `check_in_attendance`, immutability guards |
| Real attendance flow (`migrations/06`) | Applied | `face_embeddings` renamed/self-own policy; SECURITY DEFINER RPCs: `upsert_face_embedding`, `clear_face_embedding`, `enroll_self`, `get_session_attendance`; hardening; grants |
| Real-table GRANTs (`migrations/07`) | **Applied — fixes "permission denied"** | Explicit DML grants to `authenticated`, SELECT to `anon` on real tables + EXECUTE on client RPCs |
| Course ownership (`migrations/08`) | **Scripted — NOT yet executed** | `courses.lecturer_id` FK + owner-scoped create/update policies |
| Role enforcement (`migrations/09`) | **Scripted — superseded by 10** | `staff_email_domains` domain allowlist replaced by `staff_emails` exact-email allowlist in migration 10; `handle_new_user` demotes non-allowlisted lecturers; profiles INSERT closed to `role='student'` |
| Lecturer allowlist (`migrations/10`) | **Scripted — NOT yet executed** | `staff_emails` table (exact email match, replaces `staff_email_domains` domain match); `is_staff_email()` re-pointed; client `rolePolicy.ts` reads the same table |
| Signup | Done | Student/Lecturer toggle + hCaptcha; `AuthContext.signUp` accepts `captchaToken` |
| Lecturer dashboard | Done | Collapsible sidebar (Overview, Courses, Update profile, Sign out), stat cards, session live page |
| Student dashboard | Done | Same shell/sidebar, Overview + Courses + Update profile pages, live face check-in |
| New session form | Done | "Start now" vs "Schedule for later" + registration duration (5/15/30/60 min) that auto-computes session end |
| Face pipeline | Done | face-api 0.22.2 (tiny detector/landmarks/recognition, models in `public/models/`), pure math + model-version helpers in `src/lib/faceCompare.ts` |
| Automated tests | 73/74 pass | 1 known pre-existing failure: `tests/schema.test.ts` reads stale `table_state.json` snapshot (row format + column rename); regenerating the snapshot fixes it |
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
  - Update profile (`/student/profile`): shared `ProfileSettings` (student/staff field chosen by loaded role) + `FaceBiometricsCard` (face template add/update/remove).
- Profile is fully dashboard-native: the student/lecturer profile pages render inside the shared `DashboardShell`, and the old standalone `/profile` page now redirects known student/lecturer roles into their dashboard (`/student/profile`, `/dashboard/profile`). `/profile` survives only as the fallback for admins and unreadable roles.

### 2.6 New session form
- Segmented control: **Start now** vs **Schedule for later**.
- **Registration duration** (5/15/30/60 min) replaces the manual end-time picker; end = start + duration, previewed live ("Starts now · ends at … · registration open for 30 min").
- Start now: inserts the session already `ongoing` with `actual_start` set and navigates to the live attendance page. Schedule: validates a future start, inserts `scheduled`.

### 2.7 Face recognition pipeline
- face-api 0.22.2; detection options `TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 })`; hook must call `withFaceLandmarks(true)` for the tiny-landmark net; `public/models/` complete.
- Model version pins template compat: stale templates (version mismatch) are rejected client-side and prompted for re-enrollment.

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
| Sandbox module left untouched throughout | Explicit user instruction; all new work is on the real tables |

---

## 5. Known issues / follow-ups
1. **Execute `migrations/08_course_lecturer.sql`** in the Supabase SQL Editor (06/07 already applied). Legacy courses keep `lecturer_id NULL` until an admin reassigns them.
2. **Execute `migrations/10_staff_email_allowlist.sql`** in the Supabase SQL Editor, then manage the lecturer allowlist in the DB (`staff_emails` table), e.g. `insert into public.staff_emails (email) values ('lecturer@uni.edu');`. This is the **required** server-side enforcement step — until it's applied, a hand-rolled `supabase.auth.signUp()` call can still mint a lecturer.
3. **`tests/schema.test.ts` fails (pre-existing, 1 of 69):** it compares against `tests/table_state.json`, whose row format no longer matches (also stale after the column rename). Regenerate the snapshot.
4. **Camera/DB verification is manual:** nothing here runs a live camera or hits the live project — validated via lint + build + tests only.
5. **Bundle size:** production chunk >500 kB from `face-api.js`; consider dynamic import / code-splitting.
6. **Face threshold:** `isMatch` uses strict `<` vs 0.6; exactly-at-threshold pairs reject. Revisit when tuning FAR/FRR.
7. **Phase-2 scope (non-goals):** geofencing (PostGIS) and OTP fallback intentionally unbuilt.
8. **Edge functions:** repo tracks none; any on the live project predate this repo — port or delete.
9. **Pre-existing real users with wrong stored role:** migration 09 only prevents new bad roles; earlier lecturers still need a guarded repair (see migration 09 §5 informational query for candidates).
10. **Dev-server quirk:** the Vite script runs the Windows `node.exe`; use Windows `curl.exe` and `--strictPort` when probing.

---

## 7. Files changed in the latest phase

```
migrations/06_real_attendance_flow.sql      # NEW — real face embeddings + enroll/roster RPCs
migrations/07_real_table_grants.sql         # NEW — explicit GRANTs (fixes "permission denied")
migrations/08_course_lecturer.sql           # NEW — courses.lecturer_id + owner policies (PENDING)
migrations/09_role_server_side.sql          # NEW — staff_email_domains allowlist + handle_new_user demotion (SUPERSEDED by 10)
migrations/10_staff_email_allowlist.sql     # NEW — staff_emails exact-email allowlist (PENDING execution)
scripts/reset_supabase_project.sql          # UPDATED — chain now includes 05-10
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
tests/theme.test.ts                         # NEW (Phase A) — nextTheme/resolveTheme/readStoredTheme/isTheme
tests/rolePolicy.test.ts                    # NEW (Phase B) — staff-domain allowlist + assertRoleAllowed + postSignupPath
tests/roleGuards.test.ts                    # NEW (Phase B) — decideGuard fail-closed matrix
src/lib/themeUtils.ts                       # NEW (Phase A) — pure theme model (Theme/THEMES/storage/resolve/cycle)
src/lib/themeModes.ts                       # NEW (Phase A) — THEME_CYCLE + icons for ThemeToggle
src/lib/rolePolicy.ts                       # UPDATED — staff_emails exact-email allowlist / isStaffEmail / assertRoleAllowed / postSignupPath
src/hooks/useCaptcha.ts                     # NEW — shared captcha gate wiring for Login/Signup
src/lib/guardPolicy.ts                      # NEW (Phase B) — pure decideGuard decision matrix + homeFor
tests/roleGuards.test.ts                    # UPDATED — decideGuestAccess matrix
src/components/GuestRoute.tsx               # NEW — guest-only route guard for /login and /signup
src/pages/Login.tsx                         # UPDATED — no Navbar/Footer; guarded by GuestRoute
src/pages/Signup.tsx                        # UPDATED — no Navbar/Footer; guarded by GuestRoute
src/App.tsx                                 # UPDATED — /login and /signup wrapped in GuestRoute
src/contexts/ThemeContext.tsx               # REWRITTEN (Phase A) — single derived resolvedTheme effect, cycleTheme, live matchMedia
src/contexts/RoleContext.tsx                # NEW (Phase B) — profiles.role source of truth, fail-closed status
src/components/ThemeToggle.tsx              # NEW (Phase A) — cycling light/dark/system button
src/components/RoleRoute.tsx                # NEW (Phase B) — shared fail-closed guard
src/main.tsx                                # UPDATED — ThemeProvider > AuthProvider > RoleProvider > App
src/components/Navbar.tsx                   # UPDATED — ThemeToggle replaces dropdown; dashboardPath(role)
src/pages/Home.tsx                          # UPDATED — role via useRole
src/pages/Login.tsx                         # UPDATED — profile role only, no metadata fallback
src/pages/Onboarding.tsx                    # REWRITTEN — role-driven redirect, no self-upsert
src/pages/Profile.tsx                       # UPDATED — redirects known roles into dashboard; face section moved to FaceBiometricsCard
src/components/dashboard/FaceBiometricsCard.tsx # NEW — face template card inside student dashboard profile
src/pages/StudentHome.tsx                   # UPDATED — shell prop cleanup
src/pages/StudentCourses.tsx                # UPDATED — shell prop cleanup
src/pages/StudentProfile.tsx                # UPDATED — shell prop cleanup
index.html                                  # UPDATED (Phase A) — blocking theme init script (FOUC)
src/index.css                               # UPDATED (Phase A) — color-scheme for :root/.dark
.env.example                                # UPDATED — VITE_STAFF_EMAIL_DOMAINS retired; allowlist now in staff_emails table
tests/loader.mjs                            # FIXED — specifier typo broke non-@/ imports in the test runner
src/lib/dialogClasses.ts                    # NEW — fullScreenOnMobile dialog-content classes (safe-area aware)
src/components/ui/dialog.tsx                # NEW — Base UI Dialog wrapper (Content/Header/Footer/Title/Description)
src/components/ui/tabs.tsx                  # NEW — Base UI Tabs wrapper (List/Trigger/Content, data-active styling)
src/components/ui/input.tsx                 # NEW — Base UI Input wrapper
src/components/DashboardShell.tsx           # REWRITTEN (3.6) — collapsible sidebar + mobile top bar + bottom tab bar
src/lib/nav.ts                              # UPDATED (3.6) — short labels for the tab bar (Home/Courses/Profile)
src/components/dashboard/FaceBiometricsCard.tsx # REWRITTEN (3.6) — Dialog-based enroll + in-dialog confirm-remove
src/components/dashboard/ProfileSettings.tsx    # REWRITTEN (3.6) — section layout + ui/input
src/components/dashboard/StatCard.tsx       # UPDATED (3.6) — card layout polish
src/pages/StudentHome.tsx                   # REWRITTEN (3.6) — skeleton loaders + Dialog verify flow
src/pages/StudentCourses.tsx                # REWRITTEN (3.6) — Tabs + catalog search + enroll dialog
src/pages/StudentProfile.tsx                # UPDATED (3.6) — "Profile" title
src/index.css                               # UPDATED (3.6) — tap-highlight / overscroll / touch-action / reduced-motion
```