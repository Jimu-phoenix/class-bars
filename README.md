# Class-BARS

**Class-BARS (Biometric Attendance Recording System)** is a web application for recording student class attendance using facial recognition. Lecturers start a session for a course/venue; enrolled students check in by looking at their camera — a face embedding is matched against the student's stored template and attendance is recorded. No geolocation or OTP is involved in this phase.

A built-in **sandbox mode** lets you demo the entire flow end-to-end with no real accounts: a guest lecturer starts the default test class, guest students check in with face capture only. All sandbox data lives in separate tables and is disposable.

## Tech stack

| Layer | Technology |
|---|---|
| UI | React 19 + TypeScript, React Router 7 |
| Build | Vite 8 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`), shadcn-style components on `@base-ui/react`, `class-variance-authority`, `lucide-react`, Inter variable font |
| Backend | Supabase — Postgres with Row Level Security, Auth (email/password + Anonymous sign-ins), Google reCAPTCHA widget (client-side) |
| Face recognition | `face-api.js` — TinyFaceDetector + 128-d descriptors; only encrypted embeddings are stored, never images |
| Tests | Node's built-in test runner (`node:test`) — zero test dependencies |

## Getting started

```bash
npm install
cp .env.example .env   # then fill it in
npm run dev
```

### Environment variables

```ini
VITE_SUPABASE_URL=              # Supabase project URL
VITE_SUPABASE_PUBLISHABLE_KEY=  # anon/publishable key
VITE_RECAPTCHA_SITE_KEY=        # PUBLIC reCAPTCHA v2 site key (google.com/recaptcha/admin)
```

The reCAPTCHA widget runs **client-side only** — it is a bot speed bump on the sign-up, login and sandbox forms and is *not* verified server-side. There is no secret key and no Supabase auth hook to configure.

### Supabase configuration checklist

1. Database: run the migration chain below.
2. Authentication -> Sign In / Providers -> **Anonymous**: enabled (required for sandbox mode).
3. Authentication -> **Attack Protection**: leave the native captcha provider **disabled**. It is global to all of Auth and only understands hCaptcha/Turnstile, so switching it on rejects every request (sign-up, sign-in, password reset) with `captcha protection: request disallowed (no captcha_token found)`.

## Database setup

SQL files are applied manually via Supabase Dashboard -> SQL Editor, **in this order**:

1. `class_bars_schema_no_geo.sql` — base Phase-1 schema (tables, enums, RLS, check-in/session RPCs)
2. `migrations/01_security_and_policies.sql` — staff policies, hardened check-in, immutability guards
3. `migrations/02_sandbox_module.sql` — sandbox tables + RLS (isolated from all real tables)
4. `migrations/04_sandbox_profile_exclusion.sql` — signup trigger: creates profiles with correct roles, keeps anonymous/sandbox identities out of `profiles`
5. `migrations/05_sandbox_participants.sql` — sandbox participant profiles: stored face templates for the 2-step onboarding → check-in flow
6. `migrations/06_real_attendance_flow.sql` — real face embeddings + hardened attendance/session RPCs
7. `migrations/07_real_table_grants.sql` — explicit GRANTs on the real (non-sandbox) tables
8. `migrations/08_course_lecturer.sql` — courses belong to the lecturer who created them
9. `migrations/09_role_server_side.sql` — server-side staff allowlist + `handle_new_user()` role enforcement
10. `migrations/10_course_attendance_export.sql` — `get_course_attendance` (roster × sessions, absent fallback)
11. `migrations/11_lecturer_roster.sql` — `get_lecturer_roster` (enrolled students per lectured course)

`migrations/03_table_details.sql` is **not** part of the chain — it's a read-only report of your live schema (columns, constraints, RLS policies, triggers) for verification and drift checks.

### Resetting the database

`scripts/reset_supabase_project.sql` wipes everything (public schema, storage buckets, ALL auth users) back to an empty baseline so the project can be rebuilt strictly from the files above. **Destructive and irreversible** — read the header and back up first.

## Testing

No test framework dependencies are used; tests run directly with Node:

```bash
node --import ./tests/register.mjs --test tests/*.test.ts
```

Supabase is mocked — the suite makes no network requests. See `test_result.md` for coverage details.

## Project structure

```
src/
  components/     Shell/route guards + RecaptchaGate + ui/ primitives
  contexts/       AuthContext (session state, sign in/out/up)
  hooks/          useFaceDetection, usePoll, useLecturerSessions
  lib/            supabase client, sandbox logic, faceCompare, faceStorage
  pages/          Home, Login, Signup, Onboarding, Profile,
                  LecturerDashboard/Courses/Roster/NewSession, FaceTest/FaceVerify,
                  SandboxLanding/Lecturer/Student
migrations/       Numbered SQL migrations (applied via SQL Editor)
scripts/          Ops scripts (full DB reset)
tests/            Zero-dependency Node test suite
```

## Roadmap

See [PROGRESS.md](PROGRESS.md) for current status, decisions log, and follow-ups. Geofencing (PostGIS) and OTP fallback are intentionally deferred to Phase 2.
