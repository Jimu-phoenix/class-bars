-- Class-BARS Migration 38: rollback


begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, pg_temp;

drop trigger if exists trg_audit_session_started on public.class_sessions;
drop trigger if exists trg_audit_session_status_ongoing on public.class_sessions;
drop trigger if exists trg_audit_account_created on public.profiles;
drop trigger if exists trg_audit_venue_created on public.venues;
drop trigger if exists trg_audit_lecturer_email_added on public.staff_emails;

drop function if exists public.trg_audit_session_started();
drop function if exists public.trg_audit_account_created();
drop function if exists public.trg_audit_venue_created();
drop function if exists public.trg_audit_lecturer_email_added();

do $$
begin
  if to_regprocedure('public.write_audit_log(text,text,uuid,jsonb,uuid)') is not null then
    revoke all on function public.write_audit_log(text, text, uuid, jsonb, uuid)
    from public, anon, authenticated;
  end if;
end
$$;
drop function if exists public.write_audit_log(text, text, uuid, jsonb, uuid);

do $$
begin
  if to_regprocedure('public.get_user_emails(uuid[])') is not null then
    revoke all on function public.get_user_emails(uuid[]) from public, anon, authenticated;
  end if;
end
$$;
drop function if exists public.get_user_emails(uuid[]);

drop index if exists public.idx_audit_logs_action_created_at;

commit;
