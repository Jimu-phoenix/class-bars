# Class-BARS — Sandbox / Test Mode Module

**Target agent:** opencode
**Project:** Class-BARS (Biometric Attendance Recording System), MUBAS
**Working directory:** `D:\classBars\class-bars`
**Purpose of this document:** This is a build spec, not a task list to execute blindly. Read the existing repo conventions and the current schema before writing any code. Where this spec conflicts with what's actually in the codebase, the codebase wins — flag the conflict and ask rather than guessing.

---

## 1. Objective

Build a self-contained **sandbox / test mode** that lets the project be demoed end-to-end (e.g. for a supervisor, RIDC panel, or Innovations Week audience) without needing real student accounts, real enrollments, or a real class roster.

Two roles, two flows:

- **Lecturer (guest/demo lecturer):** joins sandbox mode, lands on a dashboard, and can "Start a Class" using a default seeded test class.
- **Student (guest):** joins the sandbox, sees that a class is live (once the lecturer has started it), records their face, gives themselves a display name, and checks in.

This must be demoable in a browser with no prior account setup on either side.

---

## 2. Non-goals (explicitly out of scope for this module)

Do **not** build, wire up, or stub these as if they exist:

- **Geofencing.** Not implemented anywhere in the app yet. Do not gate check-in on location. Do not add UI for it. Additive schema columns for geofencing may exist or be planned per Phase 2 design — do not touch them.
- **OTP fallback.** Also not implemented yet. Do not add an OTP input, does not need to be simulated. Sandbox check-in is face-capture-only.
- **Any change to real production tables' data** (`profiles`, `courses`, `enrollments`, `attendance_records`, `face_embeddings` as used by real students/lecturers). Sandbox activity must never be able to write into, or be confused with, real attendance data.
- **Real Supabase Auth accounts for sandbox users.** Do not require sign-up/sign-in with email/password or OTP-based auth for sandbox participants. See §5 for the intended approach.
- **Persistent long-lived sandbox history as a feature.** Sandbox data should be treated as disposable/ephemeral (see §7).

If achieving the objective seems to require crossing one of these boundaries, stop and flag it rather than improvising a workaround.

---

## 3. First step: inspect before building

Before writing any migration, RPC, or UI:

1. Read `table_state.json` (or wherever the current live schema snapshot lives — confirm the exact path/generation method if `table_state.json` isn't found where expected) to get the **actual current schema**, not the schema as designed on paper. Do not assume Phase 1 tables look exactly like earlier design docs — verify column names, types, defaults, and existing RLS policies directly.
2. Check whether primary keys on the relevant tables (`profiles`, `class_sessions`, `attendance_records`, `face_embeddings`, `courses`, `venues`) are:
   - DB-generated (`uuid` with `gen_random_uuid()` / `uuid_generate_v4()` default), or
   - App-generated (client creates the UUID and sends it).
   Follow whatever pattern is already established — **do not introduce a second ID generation convention** into the codebase. If sandbox entities need IDs and the existing tables are DB-generated, let the DB generate them; only generate client-side if that's already the existing pattern elsewhere.
3. Check existing RLS policies on the tables sandbox mode will touch. Confirm whether current policies would allow (or block) an unauthenticated/anonymous-style user from inserting a sandbox attendance record, and design around that rather than weakening real policies.
4. Check whether Supabase Anonymous Sign-ins are already enabled/used anywhere in the project. If not already in use, this is the recommended mechanism for sandbox identity (§5) — confirm it's feasible under the current Supabase free-tier project settings before committing to it.

---

## 4. Data isolation strategy (decide and document before coding)

Sandbox data must be clearly and structurally separable from real data. Two viable approaches — pick whichever fits the current schema with the least invasive change, and document the choice in the migration comment:

**Option A — Flag-based isolation (likely lowest-friction, additive):**
Add a nullable/defaulted boolean column, e.g. `is_sandbox boolean NOT NULL DEFAULT false`, to the tables sandbox mode writes to (`class_sessions`, `attendance_records`, possibly a lightweight `sandbox_participants` table — see below). This is consistent with the project's existing pattern of additive `ALTER TABLE` changes for Phase 2 rather than schema rewrites. RLS policies and any dashboards/reports for real data should filter `is_sandbox = false` (or the column should simply be ignored by real-data queries that already scope by real course/enrollment relationships).

**Option B — Fully separate sandbox tables:**
A small parallel set of tables (`sandbox_sessions`, `sandbox_participants`, `sandbox_checkins`) that never touch the real attendance schema at all. This avoids any risk of sandbox rows leaking into real queries, at the cost of some duplicated logic (e.g. a second, simpler check-in RPC).

**Recommendation:** favor **Option B** unless the schema inspection in §3 shows an easy, low-risk way to do Option A. Keeping sandbox entirely out of the real tables removes an entire class of "did a demo pollute production data" risk, which matters more here than avoiding a little duplication. Confirm this decision against what's actually feasible with the current schema before implementing — this is a recommendation, not a mandate.

Whichever option is chosen, sandbox tables/rows must be trivially identifiable and easy to bulk-delete (see §7).

---

## 5. Identity model for sandbox users

Neither the lecturer nor the students in sandbox mode should need a real MUBAS account.

- Use **Supabase Anonymous Auth** (if available on the current Supabase project tier/config) to give each sandbox participant a lightweight, real `auth.uid()` — this lets RLS policies still apply cleanly (`auth.uid()`-based policies keep working) without requiring email/OTP sign-in.
- On landing in sandbox mode:
  - **Lecturer** picks "Join as Lecturer (Sandbox)" — creates an anonymous session, tagged with a role claim/metadata of `sandbox_lecturer` (or written into a sandbox-scoped participants table — see §4 Option B).
  - **Student** picks "Join as Student (Sandbox)" — creates an anonymous session, tagged `sandbox_student`.
- If Anonymous Auth is not available/enabled on the current project, fall back to a session-only, no-auth guest identity scoped to `localStorage`/Dexie for the duration of the browser session, and have all sandbox writes go through a dedicated Edge Function that performs the insert with a service role (never exposing the service role key client-side). Only take this fallback path if anonymous auth genuinely isn't workable — confirm in §3 before defaulting to it, since it's the more complex path.

Sandbox identities are throwaway. Do not attempt to link them to real `profiles` rows.

---

## 6. Default / seeded values

On first load of sandbox mode (or via a seed script/migration), ensure the following exist and are idempotent (safe to run repeatedly without duplicating rows):

- A default sandbox course: e.g. `Sandbox / Test Course`.
- A default sandbox venue: e.g. `Sandbox / Test Venue` (no real geofencing coordinates needed — leave geofencing columns null/default, consistent with §2).
- A default sandbox class template: `Sandbox / Test Class`, associated with the above course/venue.

These defaults should be what pre-populates the lecturer's "Start a Class" action — the lecturer should be able to hit **Start Class** with zero setup and have a live session begin immediately using these defaults. Allow the class name to be edited before/at start if trivial to add, but it must not be required.

---

## 7. Lecturer flow

1. Lecturer joins sandbox mode → anonymous session created (§5).
2. Lands on a **Sandbox Dashboard** (reuse existing dashboard shell/layout/components and shadcn/ui primitives already used elsewhere in the app — do not build a one-off visual style for this).
3. Dashboard shows:
   - The default sandbox class (from §6), with a prominent **Start Class** button.
   - Once started: a live status indicator ("Class is live"), a running count of checked-in students, and a lightweight live list of check-ins as they arrive (name + timestamp + thumbnail if trivial, otherwise name + timestamp is sufficient).
   - An **End Class** / **Stop Session** action.
   - A clearly-labeled **Reset Sandbox Data** action that wipes sandbox rows (see isolation strategy in §4) — this is important for repeated demos and should not require a developer to manually clear the DB between runs.
4. Starting a class should mark the sandbox session as active in a way the student side can observe in near-real-time — use **Supabase Realtime** (Postgres changes subscription) on the sandbox session's status, consistent with how the app would ideally propagate live state elsewhere. If Realtime isn't already wired up anywhere in the project, a short client-side poll (e.g. every few seconds) against the session status is an acceptable fallback — note which approach was used.

---

## 8. Student (guest) flow

1. Student joins sandbox mode → anonymous session created (§5).
2. If no sandbox class is currently live, show a simple waiting state ("No class is live right now — ask your lecturer to start one") rather than an error.
3. Once a class is live (per §7's realtime/poll mechanism), the student is prompted to:
   - **Capture their face** — reuse the existing face-api.js (TinyFaceDetector) capture pipeline exactly as used in the real enrollment/check-in flow, run in the existing Web Worker, so this stays consistent with the production capture UX and doesn't introduce a second capture implementation.
   - **Enter a display name** — free text, no validation beyond non-empty and a sane max length. This is *not* tied to a real student profile.
4. Submitting records a sandbox check-in (§4) associated with the active sandbox session, storing the face embedding (sandbox-scoped) and the given display name.
5. Confirm success to the student clearly (e.g. "You're checked in as {name}") and reflect it on the lecturer's live list within the same latency budget as §7's realtime/poll mechanism.

No OTP step, no geofencing check, no enrollment lookup — this is intentionally the simplest possible version of the check-in flow, per §2.

---

## 9. Routing / navigation

- Sandbox mode should be reachable via its own route(s) under the existing TanStack Router setup, e.g. `/sandbox`, `/sandbox/lecturer`, `/sandbox/student` — follow whatever route-naming and file-structure conventions already exist in the router setup rather than introducing a new pattern.
- Sandbox mode should be **clearly, visibly labeled as a test/demo environment** in the UI at all times (e.g. a persistent banner or badge) so it's never mistaken for the live production flow during a demo.
- Do not link to sandbox mode from the real lecturer/student production dashboards unless explicitly asked — keep it discoverable only via direct route or an explicit "Try the demo" entry point if one is wanted.

---

## 10. Offline/PWA considerations

The real app is offline-first (Dexie.js + Workbox). Sandbox mode does **not** need to replicate full offline support — it's a live demo tool, not a field-use tool — but it must not break the existing offline/PWA behavior of the rest of the app (e.g. don't register a conflicting service worker scope, don't introduce a Dexie table that collides with existing sync logic). If in doubt, keep sandbox writes as direct online Supabase calls rather than routing them through the existing offline queue.

---

## 11. Acceptance checklist

Before considering this done, opencode should be able to demonstrate:

- [ ] `table_state.json` (or equivalent live schema source) was read and referenced before any schema/RPC work began; ID generation strategy matches existing convention.
- [ ] Sandbox data is structurally isolated from real data (per the chosen §4 option) and does not appear in any real-data views/queries.
- [ ] A lecturer can join sandbox mode with zero setup and reach a dashboard.
- [ ] The dashboard shows a default `Sandbox / Test Class` ready to start with one click.
- [ ] Starting the class makes it visible/joinable to student sandbox sessions within a reasonable, demonstrable delay.
- [ ] A student can join, see the live class, capture a face via the existing worker-based pipeline, enter a name, and check in — with no OTP or geofencing step anywhere in the flow.
- [ ] The lecturer dashboard reflects new check-ins without a manual page refresh (or with an acceptable short poll interval if Realtime wasn't used).
- [ ] A "Reset Sandbox Data" action exists and actually clears sandbox rows without touching real tables.
- [ ] Sandbox mode is visibly labeled as test/demo mode in the UI.
- [ ] No new RLS policy weakens access to real production tables.
- [ ] No geofencing or OTP UI/logic was added or stubbed as if functional.

---

## 12. Open questions to resolve with the project owner before/while building

opencode should surface these rather than silently deciding:

1. Confirm whether Supabase Anonymous Auth is enabled on the project, or whether the no-auth/Edge-Function fallback (§5) is required.
2. Confirm final choice between Option A (flag-based) and Option B (separate tables) for data isolation (§4), based on what schema inspection actually shows.
3. Confirm whether "Reset Sandbox Data" should be lecturer-facing in the UI, or a dev-only script/CLI command — either is reasonable, but the UI copy and permissions differ.
4. Confirm expected face-capture UX parity: should sandbox capture look/feel identical to the real enrollment flow, or can it be visually simplified as long as it uses the same underlying pipeline?
