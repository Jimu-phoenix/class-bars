# Class-BARS

**Class-BARS (Biometric Attendance Recording System)** is a web application for recording student class attendance using facial recognition. Lecturers start a session for a course/venue; enrolled students check in by looking at their camera — a face embedding is matched against the student's stored template and attendance is recorded. No geolocation or OTP is involved in this phase.

A built-in **sandbox mode** lets you demo the entire flow end-to-end with no real accounts: a guest lecturer starts the default test class, guest students check in with face capture only. All sandbox data lives in separate tables and is disposable.

## Tech stack

| Layer | Technology |
|---|---|
| UI | React 19 + TypeScript, React Router 7 |
| Build | Vite 8 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`), shadcn-style components on `@base-ui/react`, `class-variance-authority`, `lucide-react`, Inter variable font |
| Backend | Supabase — Postgres with Row Level Security, Auth (email/password + Anonymous sign-ins), reCAPTCHA v2 checkbox protection (client-side) |
|---|---|
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
VITE_RECAPTCHA_SITE_KEY=    # PUBLIC sitekey from Google reCAPTCHA (v2 checkbox) |

The reCAPTCHA **secret key** is not bundled (anything `VITE_` is public). If you want server-side verification later, store it outside the client (e.g. Supabase Edge Functions / your backend). No backend verification is enforced in this build.

## Database setup

SQL files are applied manually via Supabase Dashboard -> SQL Editor, **in this order**:

1. `class_bars_schema_no_geo.sql` — base Phase-1 schema (tables, enums, RLS, check-in/session RPCs)
2. `migrations/01_security_and_policies.sql` — staff policies, hardened check-in, immutability guards
3. `migrations/02_sandbox_module.sql` — sandbox tables + RLS (isolated from all real tables)
4. `migrations/04_sandbox_profile_exclusion.sql` — signup trigger: creates profiles with correct roles, keeps anonymous/sandbox identities out of `profiles`
5. `migrations/05_sandbox_participants.sql` — sandbox participant profiles: stored face templates for the 2-step onboarding → check-in flow

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
  components/     Shell/route guards + CaptchaGate + ui/ primitives
  contexts/       AuthContext (session state, sign in/out/up)
  hooks/          useFaceDetection, usePoll, useLecturerSessions
  lib/            supabase client, sandbox logic, faceCompare, faceStorage
  pages/          Home, Login, Signup, Onboarding, Profile,
                  LecturerDashboard/Courses/NewSession, FaceTest/FaceVerify,
                  SandboxLanding/Lecturer/Student
migrations/       Numbered SQL migrations (applied via SQL Editor)
scripts/          Ops scripts (full DB reset)
tests/            Zero-dependency Node test suite
```

## Roadmap

See [PROGRESS.md](PROGRESS.md) for current status, decisions log, and follow-ups. Geofencing (PostGIS) and OTP fallback are intentionally deferred to Phase 2.
