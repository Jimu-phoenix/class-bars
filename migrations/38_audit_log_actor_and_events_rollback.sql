-- =====================================================================
-- Class-BARS Migration 38: rollback
--
-- Drops the audit triggers, trigger functions, public.write_audit_log()
-- and the action/created_at index added by migration 38.
--
-- WARNING: migrations 34 and 35 now write audit_logs through
-- public.write_audit_log(), so roll them back BEFORE this one, or their
-- audit writes will fail at runtime. Rollback order: 35, 34, then 38.
-- =====================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, pg_temp;

-- 1. Triggers (idempotent).
drop trigger if exists trg_audit_session_started on public.class_sessions;
drop trigger if exists trg_audit_session_status_ongoing on public.class_sessions;
drop trigger if exists trg_audit_account_created on public.profiles;
drop trigger if exists trg_audit_venue_created on public.venues;
drop trigger if exists trg_audit_lecturer_email_added on public.staff_emails;

-- 2. Trigger functions.
drop function if exists public.trg_audit_session_started();
drop function if exists public.trg_audit_account_created();
drop function if exists public.trg_audit_venue_created();
drop function if exists public.trg_audit_lecturer_email_added();

-- 3. write_audit_log() helper.
do $$
begin
  if to_regprocedure('public.write_audit_log(text,text,uuid,jsonb,uuid)') is not null then
    revoke all on function public.write_audit_log(text, text, uuid, jsonb, uuid)
    from public, anon, authenticated;
  end if;
end
$$;
drop function if exists public.write_audit_log(text, text, uuid, jsonb, uuid);

-- 1b. get_user_emails() helper.
do $$
begin
  if to_regprocedure('public.get_user_emails(uuid[])') is not null then
    revoke all on function public.get_user_emails(uuid[]) from public, anon, authenticated;
  end if;
end
$$;
drop function if exists public.get_user_emails(uuid[]);

-- 4. Index.
drop index if exists public.idx_audit_logs_action_created_at;

commit;
