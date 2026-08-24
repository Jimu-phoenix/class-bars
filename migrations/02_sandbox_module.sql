-- =====================================================================
-- Class-BARS Migration 02: Sandbox / Test Mode module
-- Applies on top of class_bars_schema_no_geo.sql + 01_security_and_policies.sql
--
-- ISOLATION STRATEGY (spec §4): Option B -- fully separate tables.
-- sandbox_sessions / sandbox_checkins never touch real production
-- tables (profiles, courses, venues, class_sessions, enrollments,
-- attendance_records, face_embeddings). No real-table policy is
-- modified or weakened; nothing here can leak into real attendance.
--
-- DEFAULT SEEDS (spec §6): the default course/class/venue labels are
-- code constants (src/lib/sandbox.ts) applied at session start rather
-- than seeded rows -- idempotent by construction and zero footprint in
-- real catalog tables.
--
-- IDENTITY (spec §5): participants are Supabase Anonymous Auth users,
-- so every request carries a real auth.uid() with role 'authenticated'
-- and auth.uid()-based policies keep working. Their uuids are stored
-- WITHOUT a foreign key to profiles/auth.users: sandbox identities are
-- throwaway and must not be linked to real accounts. Deleting an auth
-- user therefore cannot cascade here by design.
--
-- LIVE UPDATES (spec §7): clients poll (~3s interval) instead of
-- Supabase Realtime so no publication/replication config is required.
--
-- Re-runnable: replaces functions and drops/recreates its objects.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enum (matches project convention of enum-typed status columns)
-- ---------------------------------------------------------------------
create type sandbox_session_status as enum ('live', 'ended');

-- ---------------------------------------------------------------------
-- sandbox_sessions (one row per "Start Class" press)
-- Labels are denormalized demo text -- no references to real
-- courses/venues rows, per Option B isolation.
-- ---------------------------------------------------------------------
create table sandbox_sessions (
  id           uuid primary key default gen_random_uuid(),
  lecturer_id  uuid not null,
  class_label  text not null default 'Sandbox / Test Class',
  course_label text not null default 'Sandbox / Test Course',
  venue_label  text not null default 'Sandbox / Test Venue',
  status       sandbox_session_status not null default 'live',
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  created_at   timestamptz not null default now()
);

create index idx_sandbox_sessions_status on sandbox_sessions(status, started_at desc);
create index idx_sandbox_sessions_lecturer on sandbox_sessions(lecturer_id);

-- ---------------------------------------------------------------------
-- sandbox_checkins (face capture + display name; throwaway embedding)
-- embedding holds a JSON-serialized face-api descriptor for demo
-- realism only -- it is never matched against real face_embeddings.
-- unique(session_id, participant_id) enforces one check-in per guest.
-- ---------------------------------------------------------------------
create table sandbox_checkins (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sandbox_sessions(id) on delete cascade,
  participant_id uuid not null,
  display_name   text not null check (char_length(display_name) between 1 and 60),
  embedding      text,
  created_at     timestamptz not null default now(),
  unique (session_id, participant_id)
);

create index idx_sandbox_checkins_session on sandbox_checkins(session_id, created_at);
create index idx_sandbox_checkins_participant on sandbox_checkins(participant_id);

-- =====================================================================
-- Row Level Security (sandbox tables ONLY -- no real-table changes)
--
-- Anonymous sign-ins carry role 'authenticated', so auth.role()
-- guards admit exactly the sandbox audience and nobody else.
--
-- Delete is intentionally open to all authenticated users: Reset
-- Sandbox Data must reliably wipe leftovers from ANY browser/demo run
-- without service-role involvement. The data is disposable by design;
-- worst case is a wiped demo, never a touched real record.
-- =====================================================================
alter table sandbox_sessions enable row level security;
alter table sandbox_checkins enable row level security;

create policy "Authenticated users view sandbox sessions"
  on sandbox_sessions for select
  using (auth.role() = 'authenticated');

create policy "Lecturers start own sandbox sessions"
  on sandbox_sessions for insert
  with check (lecturer_id = auth.uid());

create policy "Lecturers update own sandbox sessions"
  on sandbox_sessions for update
  using (lecturer_id = auth.uid())
  with check (lecturer_id = auth.uid());

create policy "Authenticated users reset sandbox sessions"
  on sandbox_sessions for delete
  using (auth.role() = 'authenticated');

create policy "Authenticated users view sandbox checkins"
  on sandbox_checkins for select
  using (auth.role() = 'authenticated');

create policy "Students check in as themselves"
  on sandbox_checkins for insert
  with check (participant_id = auth.uid());

create policy "Authenticated users reset sandbox checkins"
  on sandbox_checkins for delete
  using (auth.role() = 'authenticated');
