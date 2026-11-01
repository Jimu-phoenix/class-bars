# Class-BARS

**Class-BARS (Biometric Attendance Recording System)** is a web application for recording student class attendance using facial recognition. Lecturers start a session for a course/venue; enrolled students check in by looking at their camera — a face embedding is matched against the student's stored template and attendance is recorded. Check-in also verifies the student is near the session venue using a PostGIS geofence (a circle or a four-corner class box); only the gap from the fence and reported GPS accuracy are stored, never raw coordinates. OTP fallback is still deferred.

A built-in **sandbox mode** lets you demo the entire flow end-to-end with no real accounts: a guest lecturer starts the default test class, guest students check in with face capture only. All sandbox data lives in separate tables and is disposable.

## Tech stack

| Layer | Technology |
|---|---|
| UI | React 19 + TypeScript, React Router 7 |
| Build | Vite 8 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`), shadcn-style components on `@base-ui/react`, `class-variance-authority`, `lucide-react`, Inter variable font |
| Backend | Supabase — Postgres with Row Level Security, Auth (email/password + Anonymous sign-ins), reCAPTCHA v2 checkbox protection (client-side) |
|---|---|
| Face recognition | `face-api.js` — TinyFaceDetector + 128-d descriptors; descriptor JSON is stored under RLS, never images |
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
6. `migrations/06_real_attendance_flow.sql` — real attendance tables/RPCs and session checks
7. `migrations/07_real_table_grants.sql` — explicit grants for the real tables
8. `migrations/08_course_lecturer.sql` — course–lecturer assignments
9. `migrations/09_role_server_side.sql` — server-side role enforcement and staff-email checks
10. `migrations/10_staff_email_allowlist.sql` — staff email allowlist
11. `migrations/11_admin_section_rls.sql` — admin section RLS (required by migration 12)
12. `migrations/12_geofencing.sql` — PostGIS geofences (circle or class box), hardened check-in RPC, flagged attendance
13. `migrations/13_set_venue_geofence_security_definer.sql` — admin geofence setup security definer RPC
14. `migrations/14_face_embeddings_single_row.sql` — single face embedding per student (pruning duplicates & in-place update)
15. `migrations/32_face_descriptor_validation.sql` — NOT VALID descriptor CHECKs for real and sandbox face templates; run backup → migration → preflight → validate

`migrations/03_table_details.sql` is **not** part of the chain — it's a read-only report of your live schema (columns, constraints, RLS policies, triggers) for verification and drift checks. Migrations 08–14 have not been applied to every environment; apply them in order before deploying the matching client.

### Resetting the database

`scripts/reset_supabase_project.sql` wipes everything (public schema, storage buckets, ALL auth users) back to an empty baseline so the project can be rebuilt strictly from the files above. **Destructive and irreversible** — read the header and back up first.

## Testing

No test framework dependencies are used; tests run directly with Node:

```bash
node --import ./tests/register.mjs --test tests/*.test.ts
```

Supabase is mocked — the suite makes no network requests. See `test_result.md` for coverage details.

Geofencing has an additional manual SQL check: run `migrations/12_geofencing.sql` twice, then run `tests/sql/geofencing_checks.sql` in the Supabase SQL Editor. It rolls back all fixtures and prints `PASS` notices for the schema, circle radius and box geometry constraints, RPC privileges and RLS, unique sharing, venue cascade deletion, the closed direct-insert path, and the full decision table for both shapes (including small fences and clockwise/anticlockwise boxes).

## Project structure

```
src/
  components/     Shell/route guards + CaptchaGate + ui/ primitives
  contexts/       AuthContext (session state, sign in/out/up)
  hooks/          useFaceDetection, usePoll, useLecturerSessions
  lib/            supabase client, sandbox logic, faceCompare, faceCapture, faceBurst, faceQuality
  pages/          Home, Login, Signup, Onboarding, Profile,
                  LecturerDashboard/Courses/NewSession, FaceTest/FaceVerify,
                  SandboxLanding/Lecturer/Student
migrations/       Numbered SQL migrations (applied via SQL Editor)
scripts/          Ops scripts (full DB reset)
tests/            Zero-dependency Node test suite
```

## Roadmap

See [PROGRESS.md](PROGRESS.md) for current status, decisions log, and follow-ups. Geofencing (PostGIS) is implemented in migration 12; OTP fallback remains deferred.
