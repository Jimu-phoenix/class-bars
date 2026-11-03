# Class-BARS

**Class-BARS (Biometric Attendance Recording System)** is a web application for recording student class attendance using facial recognition. Lecturers start a session for a course/venue; enrolled students check in by looking at their camera — a face embedding is matched against the student's stored template and attendance is recorded. Check-in also verifies the student is near the session venue using a PostGIS geofence (a circle or a four-corner class box); only the gap from the fence and reported GPS accuracy are stored, never raw coordinates. The client sends the median descriptor distance; the database derives a calibrated match score/band, and lecturers see only a rounded match-confidence percentage. OTP fallback is available after repeated face failures.

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
15. `migrations/15_course_register_data.sql` — lecturer-only 2–8 session attendance register RPC
16. `migrations/26_proper_profiles_rls.sql` — non-recursive profile/role helper functions and policies
17. `migrations/27_fix_other_policies_for_admins.sql` — admin policy fixes for the helper functions
18. `migrations/29_fix_attendance_no_devices.sql` — remove the devices dependency from check-in
19. `migrations/30_raise_max_accuracy_200.sql` — 200 m usable GPS accuracy ceiling
20. `migrations/31_fix_box_geofence_contains.sql` — box geofence `ST_Covers`/area fix
21. `migrations/32_face_descriptor_validation.sql` — NOT VALID descriptor CHECKs for real and sandbox face templates; run backup → migration → preflight → validate
22. `migrations/33_face_match_confidence.sql` — server-computed face match score/band, 9-argument face RPC, OTP/manual compatibility, lecturer `match_score`; run `33_face_match_confidence_backup.sql` first, apply on a Supabase branch/staging project, then run `tests/sql/face_match_confidence_checks.sql`
23. `migrations/34_consent_and_account_deletion.sql` — recorded consent on profiles + self-service account deletion (students only); run `34_consent_and_account_deletion_backup.sql` first
24. `migrations/35_lecturer_manual_mark.sql` — lecturer manual "mark present" on live sessions; `get_session_enrolled_students` and `lecturer_mark_present` RPCs; students can no longer self-mark as `manual`
25. `migrations/36_history_rpcs.sql` — attendance history RPCs (`get_lecturer_sessions`, `search_my_students`, `get_student_history_for_lecturer`, `get_my_history`, `get_student_header_for_lecturer`); all lecturer-only, SECURITY DEFINER, STABLE

`migrations/03_table_details.sql` is **not** part of the chain — it's a read-only report of your live schema (columns, constraints, RLS policies, triggers) for verification and drift checks. Migrations 15, 26–35 have not been applied to every environment; apply them in order before deploying the matching client.

### Deploy order and prerequisites

Apply migrations strictly in the numbered order above on a staging/branch project before production:

1. Run `migrations/32_face_descriptor_validation_backup.sql`, then `32_face_descriptor_validation.sql`, review the preflight report, clean any invalid rows, then run `32_face_descriptor_validation_validate.sql`.
2. Run `migrations/33_face_match_confidence_backup.sql`, then `33_face_match_confidence.sql`. Run `tests/sql/geofencing_checks.sql` and `tests/sql/face_match_confidence_checks.sql` afterward.
3. Run `migrations/34_consent_and_account_deletion_backup.sql`, then `34_consent_and_account_deletion.sql`. Run `tests/sql/consent_and_deletion_checks.sql` afterward.
4. Run `migrations/35_lecturer_manual_mark.sql`. Run `tests/sql/lecturer_manual_mark_checks.sql` afterward.
5. Run `migrations/36_history_rpcs.sql`. Run `tests/sql/history_checks.sql` afterward.

`scripts/reset_supabase_project.sql` is missing migrations 10–15 and must not be used to rebuild an environment that needs the staff allowlist, admin/geofence policies, geofencing, or register export until it is updated.

### Service worker status

No service worker is registered and there is no PWA/offline implementation. The app is a standard SPA; face capture, check-in and the register PDF all run in the browser without a service worker.

### flag_reason and RLS evidence

`attendance_records.flag_reason` holds a single comma-separated string so location and face-review reasons can coexist (e.g. `low_accuracy_overlap,face_review`). `match_band` is constrained to `accept`/`review`, so a `retry` can never be stored as a row. The `face_match_config` table is single-row (`config_revision` increments on every change, recorded in `audit_logs`); its RLS select policy is `public.is_admin_user()` — authenticated students and lecturers read zero rows, admins read the row. Match fields (`match_distance`, `match_score`, `match_band`, `match_config_version`) are stripped from the student check-in JSON; the lecturer roster exposes only `match_score` (the legacy `confidence_score` is no longer returned by the roster RPC). Raw student coordinates are never stored — only `location_distance_m` and `location_accuracy_m`.

### Resetting the database

`scripts/reset_supabase_project.sql` wipes everything (public schema, storage buckets, ALL auth users) back to an empty baseline so the project can be rebuilt strictly from the files above. **Destructive and irreversible** — read the header and back up first.

## Testing

No test framework dependencies are used; tests run directly with Node:

```bash
node --import ./tests/register.mjs --test tests/*.test.ts
```

Supabase is mocked — the suite makes no network requests. See `test_result.md` for coverage details.

Geofencing has an additional manual SQL check: run `migrations/12_geofencing.sql` twice, then run `tests/sql/geofencing_checks.sql` in the Supabase SQL Editor. It rolls back all fixtures and prints `PASS` notices for the schema, circle radius and box geometry constraints, RPC privileges and RLS, unique sharing, venue cascade deletion, the closed direct-insert path, and the full decision table for both shapes (including small fences and clockwise/anticlockwise boxes). After migration 33, also run `tests/sql/face_match_confidence_checks.sql` for the score curve, accept/review/retry bands, cutoff neighbourhoods, combined flag reasons, the 8/9-argument overload split, and the admin config audit.

## Project structure

```
src/
  components/     Shell/route guards + CaptchaGate + ui/ primitives
  contexts/       AuthContext (session state, sign in/out/up)
  hooks/          useFaceDetection, usePoll, useLecturerSessions
  lib/            supabase client, sandbox logic, faceCompare, faceCapture, faceBurst, faceQuality, faceMatch
  pages/          Home, Login, Signup, Onboarding, Profile,
                  LecturerDashboard/Courses/NewSession, FaceTest/FaceVerify,
                  SandboxLanding/Lecturer/Student
migrations/       Numbered SQL migrations (applied via SQL Editor)
scripts/          Ops scripts (full DB reset)
tests/            Zero-dependency Node test suite
```

## Roadmap

See [PROGRESS.md](PROGRESS.md) for current status, decisions log, and follow-ups. Geofencing (PostGIS) is implemented in migration 12; OTP fallback is implemented; server-computed face match confidence is built in migration 33 and awaits branch/live verification.
