-- =====================================================================
-- Class-BARS Migration 38: audit-log actor (user_agent) + new event types
--
-- Adds:
--   1. public.write_audit_log(action, entity_type, entity_id, metadata, actor_id)
--      -- the single SECURITY DEFINER helper used by every audit write.
--      Triggers and other SECURITY DEFINER functions call it; clients never
--      insert into audit_logs directly. EXECUTE is revoked from public,
--      anon and authenticated (no grant is ever added).
--      user_agent is stored as '<actor email> | <real user agent>'; the
--      email is resolved server-side from auth.users, the real UA/IP are
--      read from request.headers (NULL when absent, e.g. triggers/cron).
--   2. AFTER triggers that emit four new audit events, each wrapping the
--      audit write in an exception handler so logging never blocks the
--      underlying operation:
--      - trg_audit_session_started   on class_sessions (status -> 'ongoing')
--      - trg_audit_account_created   on profiles (new row)
--      - trg_audit_venue_created     on venues (new row)
--      - trg_audit_lecturer_email_added on staff_emails (new row)
--   3. Index idx_audit_logs_action_created_at (action, created_at desc)
--      for the audit page ordering/filtering.
--
-- Migrations 34 (consent.recorded, account.deleted) and 35
-- (attendance.manual_marked) are refactored to write through this helper
-- instead of inserting audit_logs directly, so there is a single write
-- path. APPLY MIGRATION 38 BEFORE 34 OR 35.
--
-- Run order:
--   1. 38_audit_log_actor_and_events_backup.sql
--   2. 38_audit_log_actor_and_events.sql (this file)
--   3. 38_audit_log_actor_and_events_rollback.sql only if needed
--
-- Re-runnable (idempotent). Run in the SQL Editor as postgres.
-- Do NOT apply to production until migrations 34/35 are ready to follow.
-- =====================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- 1. write_audit_log() -- the single audit-write helper.
-- SECURITY DEFINER: bypasses RLS (audit_logs is select-only for clients).
-- EXECUTE is revoked from public/anon/authenticated and never granted,
-- so the client can never call it. Called only by triggers and by other
-- SECURITY DEFINER functions.
-- ---------------------------------------------------------------------
create or replace function public.write_audit_log(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid,
  p_metadata    jsonb,
  p_actor_id    uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ua      text;
  v_ip      text;
  v_ip_inet inet;
  v_headers jsonb;
begin
  -- Read the real request headers (PostgREST populates request.headers on
  -- HTTP requests). Triggers fired outside a request (cron, direct SQL)
  -- have no headers: fall back to NULL instead of failing.
  begin
    v_headers := current_setting('request.headers', true);
    if v_headers is not null then
      v_headers := v_headers::jsonb;
      v_ua := nullif(trim(v_headers->>'user-agent'), '');
      v_ip := nullif(
        trim(
          split_part(
            coalesce(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip'),
            ',',
            1
          )
        ),
        ''
      );
    end if;
  exception when others then
    v_headers := null;
    v_ua := null;
    v_ip := null;
  end;

  -- user_agent stores only the real user agent (the actor email is resolved
  -- separately on the client via get_user_emails from the actor's user_id).
  -- Truncate to a sane maximum.
  if v_ua is not null then
    v_ua := left(v_ua, 512);
  end if;

  -- IP as inet; invalid header values are stored as NULL.
  v_ip_inet := null;
  if v_ip is not null then
    begin
      v_ip_inet := v_ip::inet;
    exception when others then
      v_ip_inet := null;
    end;
  end if;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    ip_address,
    user_agent,
    created_at
  ) values (
    p_actor_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_metadata,
    v_ip_inet,
    v_ua,
    now()
  );
end;
$$;

revoke all on function public.write_audit_log(
  text, text, uuid, jsonb, uuid
) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1b. get_user_emails(user_ids) -- resolve actor emails server-side.
-- SECURITY DEFINER: reads auth.users.email (not exposed to the client
-- directly). Used by the audit-log UI to show the email behind each
-- user_id. Revoked from public/anon/authenticated -- actually granted to
-- authenticated so the admin page can call it; public and anon are revoked.
-- ---------------------------------------------------------------------
create or replace function public.get_user_emails(
  user_ids uuid[]
) returns table (
  user_id uuid,
  email   text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.id, u.email
  from auth.users u
  where u.id = any(user_ids);
end;
$$;

revoke all on function public.get_user_emails(uuid[]) from public, anon;
grant execute on function public.get_user_emails(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Trigger functions (each swallows audit-write failures so the
--    underlying operation can never fail because of logging).
-- ---------------------------------------------------------------------

-- 2a. session_started: class session status moves into 'ongoing' (live).
-- Actor = the session's lecturer. Metadata: course_id, venue_id only.
create or replace function public.trg_audit_session_started()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.write_audit_log(
    'session_started',
    'class_session',
    new.id,
    jsonb_build_object('course_id', new.course_id, 'venue_id', new.venue_id),
    new.lecturer_id
  );
  return new;
exception when others then
  raise warning 'audit_log(session_started) failed: %', sqlerrm;
  return new;
end;
$$;

-- 2b. account_created: new profile (student or lecturer). Actor = new user.
-- Metadata: role only. No biometric content ever.
create or replace function public.trg_audit_account_created()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.write_audit_log(
    'account_created',
    'profiles',
    new.id,
    jsonb_build_object('role', new.role),
    new.id
  );
  return new;
exception when others then
  raise warning 'audit_log(account_created) failed: %', sqlerrm;
  return new;
end;
$$;

-- 2c. venue_created: new venue. Actor = auth.uid() (admin).
-- Metadata: venue name only.
create or replace function public.trg_audit_venue_created()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.write_audit_log(
    'venue_created',
    'venues',
    new.id,
    jsonb_build_object('name', new.name),
    auth.uid()
  );
  return new;
exception when others then
  raise warning 'audit_log(venue_created) failed: %', sqlerrm;
  return new;
end;
$$;

-- 2d. lecturer_email_added: new address on the lecturer allow-list.
-- Actor = auth.uid() (admin). Metadata: the added email (required by feature).
create or replace function public.trg_audit_lecturer_email_added()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.write_audit_log(
    'lecturer_email_added',
    'staff_email',
    null,
    jsonb_build_object('email', new.email),
    auth.uid()
  );
  return new;
exception when others then
  raise warning 'audit_log(lecturer_email_added) failed: %', sqlerrm;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Attach the triggers.
-- ---------------------------------------------------------------------

-- INSERT path: session created already ongoing.
drop trigger if exists trg_audit_session_started on public.class_sessions;
create trigger trg_audit_session_started
  after insert on public.class_sessions
  for each row
  when (new.status = 'ongoing')
  execute function public.trg_audit_session_started();

-- UPDATE path: status changed into ongoing.
drop trigger if exists trg_audit_session_status_ongoing on public.class_sessions;
create trigger trg_audit_session_status_ongoing
  after update on public.class_sessions
  for each row
  when (
    new.status = 'ongoing'
    and old.status is distinct from new.status
  )
  execute function public.trg_audit_session_started();

drop trigger if exists trg_audit_account_created on public.profiles;
create trigger trg_audit_account_created
  after insert on public.profiles
  for each row
  execute function public.trg_audit_account_created();

drop trigger if exists trg_audit_venue_created on public.venues;
create trigger trg_audit_venue_created
  after insert on public.venues
  for each row
  execute function public.trg_audit_venue_created();

drop trigger if exists trg_audit_lecturer_email_added on public.staff_emails;
create trigger trg_audit_lecturer_email_added
  after insert on public.staff_emails
  for each row
  execute function public.trg_audit_lecturer_email_added();

-- ---------------------------------------------------------------------
-- 4. Index for the audit page (order by action + created_at desc).
-- ---------------------------------------------------------------------

create index if not exists idx_audit_logs_action_created_at
  on public.audit_logs (action, created_at desc);

commit;
