-- =====================================================================
-- Class-BARS Migration 05: Sandbox participant profiles (onboarding)
-- Applies on top of 02_sandbox_module.sql
--
-- PURPOSE
--   Gives the sandbox 2-step student flow a place to store an enrolled
--   face template. Previously the sandbox was a single-step check-in
--   (capture face + name -> check-in). Now students onboard once
--   (name + stored face descriptor), then later "register attendance"
--   by matching a fresh capture against this stored template.
--
-- ISOLATION (spec §4, Option B): fully separate table -- never touches
-- real tables (profiles, face_embeddings, ...). participant_id is an
-- Anonymous Auth uid stored WITHOUT a foreign key to profiles/auth.users,
-- exactly like sandbox_sessions/sandbox_checkins: throwaway identities
-- must not be linked to real accounts.
--
-- IDENTITY (spec §5): participant_id = auth.uid(). A cleared browser /
-- fresh anonymous session yields a new uid -> a new participant -> the
-- student re-onboards. This is intentional for the anonymous model.
--
-- Re-runnable: table via IF NOT EXISTS; policies dropped before re-create;
-- GRANTs additive.
-- =====================================================================

-- ---------------------------------------------------------------------
-- sandbox_participants (one row per enrolled sandbox student)
-- embedding holds a JSON-serialized face-api descriptor used ONLY for
-- the sandbox face-match demo -- never matched against real
-- face_embeddings.
-- ---------------------------------------------------------------------
create table if not exists sandbox_participants (
  participant_id uuid primary key,
  display_name   text not null check (char_length(display_name) between 1 and 60),
  embedding      text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_sandbox_participants_name
  on sandbox_participants(display_name);

-- ---------------------------------------------------------------------
-- Row Level Security (sandbox table ONLY -- no real-table changes)
--
-- Each participant owns their own row (auth.uid() == participant_id).
-- Delete is intentionally open to all authenticated users so Reset
-- Sandbox Data reliably wipes leftover demos from any browser run.
-- =====================================================================
alter table sandbox_participants enable row level security;

drop policy if exists "Participant views own profile" on sandbox_participants;
drop policy if exists "Participant inserts own profile" on sandbox_participants;
drop policy if exists "Participant updates own profile" on sandbox_participants;
drop policy if exists "Authenticated users reset participants" on sandbox_participants;

create policy "Participant views own profile"
  on sandbox_participants for select
  using (participant_id = auth.uid());

create policy "Participant inserts own profile"
  on sandbox_participants for insert
  with check (participant_id = auth.uid());

create policy "Participant updates own profile"
  on sandbox_participants for update
  using (participant_id = auth.uid())
  with check (participant_id = auth.uid());

create policy "Authenticated users reset participants"
  on sandbox_participants for delete
  using (auth.role() = 'authenticated');

-- =====================================================================
-- Table-level GRANTs (RLS controls rows; role needs table privileges to
-- execute queries, else "permission denied for table" even when RLS
-- would allow it).
-- =====================================================================
grant select, insert, update, delete on sandbox_participants to authenticated;
