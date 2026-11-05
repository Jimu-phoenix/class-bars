-- Class-BARS Migration 05: Sandbox participant profiles (onboarding)

create table if not exists sandbox_participants (
  participant_id uuid primary key,
  display_name   text not null check (char_length(display_name) between 1 and 60),
  embedding      text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_sandbox_participants_name
  on sandbox_participants(display_name);

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

grant select, insert, update, delete on sandbox_participants to authenticated;
