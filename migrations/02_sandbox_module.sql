-- Class-BARS Migration 02: Sandbox / Test Mode module

do $$
begin
  if not exists (select 1 from pg_type where typname = 'sandbox_session_status') then
    create type sandbox_session_status as enum ('live', 'ended');
  end if;
end
$$;

create table if not exists sandbox_sessions (
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

create index if not exists idx_sandbox_sessions_status on sandbox_sessions(status, started_at desc);
create index if not exists idx_sandbox_sessions_lecturer on sandbox_sessions(lecturer_id);

create table if not exists sandbox_checkins (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sandbox_sessions(id) on delete cascade,
  participant_id uuid not null,
  display_name   text not null check (char_length(display_name) between 1 and 60),
  embedding      text,
  created_at     timestamptz not null default now(),
  unique (session_id, participant_id)
);

create index if not exists idx_sandbox_checkins_session on sandbox_checkins(session_id, created_at);
create index if not exists idx_sandbox_checkins_participant on sandbox_checkins(participant_id);

alter table sandbox_sessions enable row level security;
alter table sandbox_checkins enable row level security;

drop policy if exists "Authenticated users view sandbox sessions" on sandbox_sessions;
drop policy if exists "Lecturers start own sandbox sessions" on sandbox_sessions;
drop policy if exists "Lecturers update own sandbox sessions" on sandbox_sessions;
drop policy if exists "Authenticated users reset sandbox sessions" on sandbox_sessions;

drop policy if exists "Authenticated users view sandbox checkins" on sandbox_checkins;
drop policy if exists "Students check in as themselves" on sandbox_checkins;
drop policy if exists "Authenticated users reset sandbox checkins" on sandbox_checkins;

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

grant select, insert, update, delete on sandbox_sessions to authenticated;
grant select, insert, update, delete on sandbox_checkins to authenticated;
