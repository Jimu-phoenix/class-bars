# Class-BARS Progress Report

**Date:** 2026-08-31
**Repo:** `D:\classBars\class-bars`
**Overall status:** Phase 1 feature-complete. Sandbox now has a 2-step student flow (onboard → verify) with persisted face templates; hCaptcha added to login; all DB scripts written and re-runnable; 36 tests passing.

---

## 1. Status snapshot

| Area | Status | Notes |
|---|---|---|
| Core schema (`class_bars_schema_no_geo.sql`) | Done | Profiles, courses, venues, class_sessions, enrollments, face_embeddings, devices, attendance_records, otp_codes, audit_logs + check-in/session RPCs |
| Security hardening (`migrations/01`) | Done | Staff policies, identity checks in `check_in_attendance`, immutability guards on `profiles.role` / `courses.course_code` |
| Sandbox module (`migrations/02`) | Done | Option B isolation: fully separate `sandbox_sessions` / `sandbox_checkins`, RLS enabled, GRANTs fixed, zero writes to real tables |
| Sandbox participants (`migrations/05`) | Done | New table `sandbox_participants` for 2-step flow: enrolled face templates per anonymous UID, RLS + GRANTs |
| Application: real-account flows | Done | Email/password auth, onboarding, face enrollment & verification, lecturer dashboard/courses/sessions |
| Application: sandbox flows | Done | Guest lecturer starts class; student onboards once (name + face), then verifies against stored template to check in |
| hCaptcha integration | Done | `HcaptchaGate` on sandbox join + **login page**; token passed to `signInWithPassword`; env-driven, dev-safe when key absent |
| Schema introspection tooling | Done | `migrations/03_table_details.sql` (read-only live-schema report) |
| Signup-trigger drift fix | Scripted | `migrations/04_sandbox_profile_exclusion.sql` — verified against live trigger output, awaiting execution |
| Full rebuild tooling | Scripted | `scripts/reset_supabase_project.sql` (destructive baseline reset + default grants) |
| Automated tests | Done | **36/36 passing** (30 original + 6 new sandbox participant tests + 1 schema test) via dependency-free Node runner |
| Documentation | Updated | README migration chain includes 05; this report |

Legend: "Done" = merged into working tree and verified by lint/build/tests. "Scripted" = SQL written and reviewed but must still be pasted into Supabase SQL Editor by a human with dashboard access.

---

## 2. Completed since initial commit

### 2.1 Sandbox / demo mode (now 2-step onboarding → check-in)
- Built per `CLASS-BARS_SANDBOX_MODULE_SPEC.md`, choosing **Option B** (separate tables) so sandbox activity can never leak into real attendance data.
- Identity via Supabase **Anonymous Sign-ins**: guests get a real `auth.uid()` carrying metadata roles (`sandbox_lecturer` / `sandbox_student`); uuids stored without FKs to real tables by design.
- **Lecturer side**: start/end the default seeded class, live check-in list, disposable data reset (cascades to `sandbox_participants` via `auth.role() = 'authenticated'` policy).
- **Student side**: on first visit (per anonymous session) shows **onboarding screen** — enter display name + capture face → stored in `sandbox_participants`. On subsequent visits with the same anonymous UID, onboarding is skipped; student sees live-class polling and clicks **Register attendance** to open camera, live-match against stored template, auto-record check-in on match.
- Polling instead of Realtime: no publication config needed.

### 2.2 hCaptcha for anonymous sign-ins + login
- Added `@hcaptcha/react-hcaptcha`; shared `HcaptchaGate` component gates both sandbox join buttons **and the login form**.
- Tokens forwarded through `joinSandbox` → `signInAnonymously` (sandbox) and `signInWithPassword` (login); single-use, reset after failures/expiry.
- `VITE_HCAPTCHA_SITEKEY` documented in `.env.example`; the hCaptcha **secret** stays only in the Supabase dashboard (never bundled client-side).
- Graceful degradation locally: no sitekey → widget hidden, buttons behave as before.

### 2.3 Database alignment (the drift cleanup)
Investigation of the live project revealed an **untracked signup trigger** (standard Supabase template) inserting every new auth user — anonymous sandbox guests included — into `profiles` as `'student'`. None of that existed in repo SQL. Resolution:
- `migrations/03_table_details.sql`: read-only catalog report (tables, columns, constraints, indexes, RLS, triggers, enums, per-table JSON) to expose drift directly from the live DB.
- `migrations/04_sandbox_profile_exclusion.sql`: replaces `handle_new_user()` so anonymous/sandbox users never get profile rows and real signups honor their chosen role (lecturer no longer lands as student; admin can never come from client metadata). Sweeps stray triggers off `auth.users`, cleans polluted guest rows.
- `scripts/reset_supabase_project.sql`: destructive full reset (public schema + storage + auth users) restoring Supabase-default grants, for rebuilding strictly from tracked files.

### 2.4 Migration re-runnability fix
- `migrations/02_sandbox_module.sql` rewritten to be fully idempotent: enum via `IF NOT EXISTS` guard, tables via `CREATE TABLE IF NOT EXISTS`, indexes via `CREATE INDEX IF NOT EXISTS`, policies via `DROP POLICY IF EXISTS` before recreate, GRANTs additive.

### 2.5 Test suite
- Zero-dependency suite using Node's built-in runner + native TS stripping; `@/lib/supabase` mocked so tests make zero network calls.
- **36/36 passing** across: face-match math, sandbox logic (captcha forwarding, error mapping, participant get/upsert/delete), schema static assertions (isolation guarantees for 02 and 05), and utils.

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
| Client-side face matching for sandbox check-in | Reuses existing `faceCompare.ts`; matches FaceVerify demo pattern; simpler than RPC |
| Re-onboard on new anonymous session | New UID = new participant; aligns with throwaway anonymity model |
| Skip onboarding if profile exists (same UID) | Better UX; "Re-do onboarding" button available if needed |
| Migration 05 as separate file (not amending 02) | Keeps numbered chain clean; 02 already applied in live DB; 05 is incremental |

---

## 4. Known issues / follow-ups

1. **Execute the DB scripts.** Migrations 04, 05 + the reset script exist only as files until pasted into Supabase SQL Editor (runbook in README).
2. **Edge functions:** repo tracks none. Any on the live project were authored elsewhere — delete or port them; adopting `supabase init`/CLI would prevent future drift.
3. **Pre-existing real users with wrong stored role:** migration 04 fixes new signups only; any real lecturer created before the fix needs a guarded repair (blocked client-side by design).
4. **Bundle size:** production chunk >500 kB from `face-api.js`; consider dynamic import/code-splitting.
5. **Face-match threshold:** `isMatch` uses strict `<` vs 0.6 — exactly-at-threshold pairs reject. Revisit when tuning FAR/FRR.
6. **Phase 2 scope pending:** geofencing (PostGIS) and OTP fallback remain intentionally unbuilt (spec non-goals).
7. **Sandbox participant refresh on external reset:** if lecturer resets while student is idle, the student's cached `participant` state becomes stale. Current workaround: "Re-do onboarding" button. Could add a periodic re-fetch or listener for production hardening.

---

## 5. Files changed this session

```
migrations/05_sandbox_participants.sql         # NEW — sandbox participant profiles table
migrations/02_sandbox_module.sql               # UPDATED — fully re-runnable (enum, tables, indexes, policies, GRANTs)
src/lib/sandbox.ts                             # ADDED getSandboxParticipant, upsertSandboxParticipant, deleteSandboxParticipant
src/pages/SandboxStudent.tsx                   # REWRITTEN — 2-step state machine (onboarding → idle → verifying → checkedIn)
src/pages/Login.tsx                            # ADDED HcaptchaGate, captchaToken passed to signIn
src/contexts/AuthContext.tsx                   # UPDATED signIn to accept optional captchaToken
src/types/db.ts                                # ADDED SandboxParticipantRow type
README.md                                      # UPDATED migration chain to include 05
tests/sandbox.test.ts                          # ADDED 7 tests for participant logic + extended mock .from()
tests/schema.test.ts                           # ADDED test for migration 05 isolation + RLS
```
