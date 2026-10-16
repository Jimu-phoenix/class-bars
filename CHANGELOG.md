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
- **Lecturer roster page** — a **Roster** sidebar item (`/dashboard/roster`)
  listing every student enrolled in each course the lecturer teaches, with a
  course filter and a name/registration-number search.
  - `src/pages/LecturerRoster.tsx`
  - `src/lib/nav.ts`, `src/App.tsx`
- **`get_lecturer_roster` RPC** — `SECURITY DEFINER` function returning enrolled
  students (joined to `profiles`) for a course the caller lectures, or for every
  such course when `p_course_id` is NULL. Explicit `grant execute`.
  - `migrations/11_lecturer_roster.sql`
  - `LecturerRosterRow` type + `getLecturerRoster(courseId?)` in
    `src/lib/realAttendance.ts` (`tests/roster.test.ts`).
- **Google reCAPTCHA v2 (replaces hCaptcha)** — `RecaptchaGate` renders the
  widget (loaded from Google's script, no extra dependency) as a **client-side**
  bot speed bump on the sign-up, login and sandbox forms. It is not verified
  server-side.
  - `src/components/RecaptchaGate.tsx` (replaces `HcaptchaGate.tsx`)
- **`authErrors` mapper** — turns raw Auth errors into actionable text,
  including the native-captcha switch vs. a failed reCAPTCHA vs. anonymous
  sign-ins disabled.
  - `src/lib/authErrors.ts` (`tests/authErrors.test.ts`)

### Changed

- **Reset script chain comment** now lists migrations `09_role_server_side.sql`
  and `10_course_attendance_export.sql`.
  - `scripts/reset_supabase_project.sql`
- **Captcha env vars renamed** — `VITE_HCAPTCHA_SITEKEY` →
  `VITE_RECAPTCHA_SITE_KEY` (public site key only; there is no server secret).
  - `.env.example`
- **Captcha is client-side only** — the widget no longer sends a token:
  `recaptcha_token` was dropped from the `signUp`/`signInAnonymously` metadata
  in `AuthContext`/`sandbox.ts`. The widget merely gates the submit button.
  - `src/contexts/AuthContext.tsx`, `src/lib/sandbox.ts`
- **Error surfacing** — `Signup`/`Login`/sandbox run errors through
  `mapAuthError` so setup mistakes (e.g. native captcha left on) are explained.
  - `src/pages/Signup.tsx`, `src/pages/Login.tsx`, `src/lib/sandbox.ts`

### Decisions

### Decisions

- **Replace hCaptcha with the Google reCAPTCHA v2 widget, client-side only.**
  Supabase's native captcha integration only verifies hCaptcha and Cloudflare
  Turnstile, so Google tokens cannot be checked natively. Rather than stand up
  a `before-user-created` Edge Function to verify them, the widget is kept as a
  lightweight UI deterrent only. **Trade-off:** it provides no server-side bot
  protection — a bot can bypass the UI and call the auth API directly.
- **Native captcha protection must stay OFF.** It is global to all of Auth
  (it also gates sign-in, `/recover` and `/resend`) and rejects every request
  that lacks its own token with
  `captcha protection: request disallowed (no captcha_token found)`.
  - The native switch and the Google site key are unrelated: the site key is a
    client-only widget; the native switch only accepts hCaptcha/Turnstile.

### Verified

- `npx tsc -b` — clean
- `npm run lint` — clean
- `npm run build` — succeeds
- `node --import ./tests/register.mjs --test tests/*.test.ts` — 90/90 pass
  (`tests/schema.test.ts` now validates the real `table_state.json` row shape)

### Database migrations

- Migrations **06–11** are applied to the live Supabase project (in numeric
  order). `10`/`11` back the Export and Roster features.
- `table_state.json` is still the pre-migration snapshot; regenerate it from
  the live DB if a current schema snapshot is wanted (the test now matches the
  file's real row shape, so the suite is green regardless).

---

## Notes

- This entry covers the attendance-export iteration. Prior uncommitted work
  (unified lecturer/student dashboard shell, real DB-backed attendance, signup
  rework, face pipeline) is documented in `PROGRESS.md`.
- The sandbox module was intentionally left untouched, per project decision.
