# Class-BARS Progress Report

**Date:** 2026-08-24
**Repo:** `D:\classBars\class-bars`
**Overall status:** Phase 1 (face-based attendance) feature-complete at the application layer; sandbox/demo mode built and tested; database alignment work completed as scripts awaiting execution against the live project.

---

## 1. Status snapshot

| Area | Status | Notes |
|---|---|---|
| Core schema (`class_bars_schema_no_geo.sql`) | Done | Profiles, courses, venues, class_sessions, enrollments, face_embeddings, devices, attendance_records, otp_codes, audit_logs + check-in/session RPCs |
| Security hardening (`migrations/01`) | Done | Staff policies, identity checks in `check_in_attendance`, immutability guards on `profiles.role` / `courses.course_code` |
| Sandbox module (`migrations/02`) | Done | Option B isolation: fully separate `sandbox_sessions` / `sandbox_checkins`, RLS enabled, zero writes to real tables |
| Application: real-account flows | Done | Email/password auth, onboarding, face enrollment & verification, lecturer dashboard/courses/sessions |
| Application: sandbox flows | Done | Guest lecturer/student join, live-class polling, face-capture check-in |
| hCaptcha integration | Done | `HcaptchaGate` component, token forwarded through `joinSandbox` -> `signInAnonymously`, env-driven, dev-safe when key absent |
| Schema introspection tooling | Done | `migrations/03_table_details.sql` (read-only live-schema report) |
| Signup-trigger drift fix | Scripted | `migrations/04_sandbox_profile_exclusion.sql` — verified against live trigger output, awaiting execution |
| Full rebuild tooling | Scripted | `scripts/reset_supabase_project.sql` (destructive baseline reset + default grants) |
| Automated tests | Done | 30 tests passing via dependency-free Node runner (`tests/`, see `test_result.md`) |
| Documentation | Updated | README rewritten; this report |

Legend: "Done" = merged into working tree and verified by lint/build/tests. "Scripted" = SQL written and reviewed but must still be pasted into Supabase SQL Editor by a human with dashboard access.

---

## 2. Completed since initial commit

### 2.1 Sandbox / demo mode
- Built per `CLASS-BARS_SANDBOX_MODULE_SPEC.md`, choosing **Option B** (separate tables) so sandbox activity can never leak into real attendance data.
- Identity via Supabase **Anonymous Sign-ins**: guests get a real `auth.uid()` carrying metadata roles (`sandbox_lecturer` / `sandbox_student`); uuids stored without FKs to real tables by design.
- Lecturer side: start/end the default seeded class, live check-in list, disposable data reset.
- Student side: polls for a live session (~3 s), captures face via webcam, self-names, checks in once.
- Polling instead of Realtime: no publication config needed.

### 2.2 hCaptcha for anonymous sign-ins
- Added `@hcaptcha/react-hcaptcha`; shared widget gates both sandbox join buttons; tokens are single-use and reset after failures/expiry.
- `VITE_HCAPTCHA_SITEKEY` documented in `.env.example`; the hCaptcha **secret** stays only in the Supabase dashboard (never bundled client-side).
- Graceful degradation locally: no sitekey -> widget hidden, buttons behave as before.

### 2.3 Database alignment (the drift cleanup)
Investigation of the live project revealed an **untracked signup trigger** (standard Supabase template) inserting every new auth user — anonymous sandbox guests included — into `profiles` as `'student'`. None of that existed in repo SQL. Resolution:
- `migrations/03_table_details.sql`: read-only catalog report (tables, columns, constraints, indexes, RLS, triggers, enums, per-table JSON) to expose drift directly from the live DB.
- `migrations/04_sandbox_profile_exclusion.sql`: replaces `handle_new_user()` so anonymous/sandbox users never get profile rows and real signups honor their chosen role (lecturer no longer lands as student; admin can never come from client metadata). Sweeps stray triggers off `auth.users`, cleans polluted guest rows.
- `scripts/reset_supabase_project.sql`: destructive full reset (public schema + storage + auth users) restoring Supabase-default grants, for rebuilding strictly from tracked files.

### 2.4 Test suite
- Zero-dependency suite using Node's built-in runner + native TS stripping; `@/lib/supabase` mocked so tests make zero network calls.
- 30/30 passing across face-match math, sandbox logic (incl. captcha forwarding/error mapping), schema static assertions (isolation guarantees), and utils. See `test_result.md`.

---

## 3. Decisions log

| Decision | Rationale |
|---|---|
| Option B sandbox isolation | Structural separation beats flag-filtering; spec §4 |
| Anonymous Auth for sandbox identity | Real `auth.uid()` keeps RLS meaningful without accounts (spec §5) |
| Polling over Realtime | Fewer moving parts for a demo module (spec §7) |
| No signup trigger in base design | App self-heals profiles client-side; migration 04 now adds a hardened one anyway |
| Sitekey-only in `.env` | `VITE_` vars are public bundles; secret lives in dashboard |
| Reset script outside `migrations/` | Numbered chain must stay idempotent/rebuildable; a nuke is neither |

## 4. Known issues / follow-ups

1. **Execute the DB scripts.** Migration 04 + the reset script exist only as files until pasted into Supabase SQL Editor (runbook in README).
2. **Edge functions:** repo tracks none. Any on the live project were authored elsewhere — delete or port them; adopting `supabase init`/CLI would prevent future drift.
3. **Pre-existing real users with wrong stored role:** migration 04 fixes new signups only; any real lecturer created before the fix needs a guarded repair (blocked client-side by design).
4. **Bundle size:** production chunk >500 kB from `face-api.js`; consider dynamic import/code-splitting.
5. **Face-match threshold:** `isMatch` uses strict `<` vs 0.6 — exactly-at-threshold pairs reject. Revisit when tuning FAR/FRR.
6. **Phase 2 scope pending:** geofencing (PostGIS) and OTP fallback remain intentionally unbuilt (spec non-goals).
