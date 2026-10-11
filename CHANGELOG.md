# Changelog

All notable changes to Class-BARS are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- **Attendance CSV export (per course)** — lecturers get an **Export records**
  button on the dashboard that opens an inline form to pick a course; exports
  the whole course as CSV. Course options are derived from the lecturer's own
  sessions, so it works even before `courses.lecturer_id` (migration 08) is
  applied on the live DB.
  - `src/pages/LecturerDashboard.tsx`
- **Attendance CSV export (single session)** — an **Export CSV** button in the
  attendance-roster card on the session live page.
  - `src/pages/SessionLive.tsx`
- **CSV helpers** — `escapeCsv`, `toCsv`, `buildAttendanceCsv`, `downloadCsv`,
  `sanitizeFilename`.
  - `src/lib/csv.ts`
  - CSV shape: `Student Name`, `Reg. #`, then one column per session labelled
    `yyyy-mm-dd hh:mm`. Each cell is a single combined value:
    `Present (97%)`, `Late (85%)`, or `Absent`.
- **`get_course_attendance` RPC** — `SECURITY DEFINER` function returning the
  enrolled roster crossed with every session of a course, left-joined to
  `attendance_records` so students who never checked in appear as `absent`.
  Lecturer-scoped (owns the course or at least one session in it). Explicit
  `grant execute` to `anon, authenticated`.
  - `migrations/10_course_attendance_export.sql`
- **`CourseAttendanceRow` type + `getCourseAttendance(courseId)`** data-layer
  wrapper.
  - `src/lib/realAttendance.ts`
- **CSV unit tests** — quoting/escaping edge cases, wide-format builder
  (session ordering, per-session combined cells, absent handling, null
  confidence), filename sanitisation.
  - `tests/csv.test.ts`

### Changed

- **Reset script chain comment** now lists migrations `09_role_server_side.sql`
  and `10_course_attendance_export.sql`.
  - `scripts/reset_supabase_project.sql`

### Decisions

- **Keep hCaptcha (no change).** The captcha token passed to
  `supabase.auth.signUp` / `signInWithPassword` / `signInAnonymously` is already
  verified **server-side** by Supabase Auth (it calls `hcaptcha.com/siteverify`
  with the dashboard-configured secret — the client never holds it). Google
  reCAPTCHA is **not** a supported provider of Supabase's native captcha
  integration (only hCaptcha and Cloudflare Turnstile are), so switching would
  require abandoning the native flow for a custom Edge Function.

### Verified

- `npx tsc -b` — clean
- `npm run lint` — clean
- `npm run build` — succeeds
- `node --import ./tests/register.mjs --test tests/*.test.ts` — 49/50 pass
  (1 pre-existing failure: `tests/schema.test.ts`, stale `table_state.json`)

### Pending manual step

- Apply migrations **08, 09 and 10** to the live Supabase project (SQL Editor,
  in numeric order). Until `10` is applied the two Export buttons surface an
  RPC-not-found error. Migrations 06/07 are already applied.

---

## Notes

- This entry covers the attendance-export iteration. Prior uncommitted work
  (unified lecturer/student dashboard shell, real DB-backed attendance, signup
  rework, face pipeline) is documented in `PROGRESS.md`.
- The sandbox module was intentionally left untouched, per project decision.
