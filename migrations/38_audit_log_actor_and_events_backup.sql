-- Class-BARS Migration 38: backup before audit-log actor + new events


begin;

set lock_timeout = '5s';
set statement_timeout = '30s';

create schema if not exists migration_backups;

-- Full audit_logs snapshot.
drop table if exists migration_backups.audit_logs_38;
create table migration_backups.audit_logs_38
  as select * from public.audit_logs;

-- Function definitions this migration replaces, if they exist.
do $$
begin
  if to_regprocedure('public.write_audit_log(text,text,uuid,jsonb,uuid)') is not null then
    drop table if exists migration_backups.write_audit_log_38;
    create table migration_backups.write_audit_log_38
      as select
        pg_get_functiondef(p.oid) as definition
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'write_audit_log'
        and pg_get_function_arguments(p.oid) = 'action text, entity_type text, entity_id uuid, metadata jsonb, actor_id uuid';
  end if;
end
$$;

do $$
begin
  if to_regprocedure('public.record_consent(text)') is not null then
    drop table if exists migration_backups.record_consent_38;
    create table migration_backups.record_consent_38
      as select pg_get_functiondef(p.oid) as definition
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'record_consent';
  end if;
end
$$;

do $$
begin
  if to_regprocedure('public.delete_my_account()') is not null then
    drop table if exists migration_backups.delete_my_account_38;
    create table migration_backups.delete_my_account_38
      as select pg_get_functiondef(p.oid) as definition
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'delete_my_account';
  end if;
end
$$;

do $$
begin
  if to_regprocedure('public.lecturer_mark_present(uuid,uuid)') is not null then
    drop table if exists migration_backups.lecturer_mark_present_38;
    create table migration_backups.lecturer_mark_present_38
      as select pg_get_functiondef(p.oid) as definition
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'lecturer_mark_present';
  end if;
end
$$;

-- Keep backup tables read-only snapshots.
revoke all on table migration_backups.audit_logs_38 from public, anon, authenticated;
do $$
begin
  if to_regclass('migration_backups.write_audit_log_38') is not null then
    revoke all on table migration_backups.write_audit_log_38 from public, anon, authenticated;
  end if;
  if to_regclass('migration_backups.record_consent_38') is not null then
    revoke all on table migration_backups.record_consent_38 from public, anon, authenticated;
  end if;
  if to_regclass('migration_backups.delete_my_account_38') is not null then
    revoke all on table migration_backups.delete_my_account_38 from public, anon, authenticated;
  end if;
  if to_regclass('migration_backups.lecturer_mark_present_38') is not null then
    revoke all on table migration_backups.lecturer_mark_present_38 from public, anon, authenticated;
  end if;
end
$$;

select 'audit_logs_38' as backup_table, count(*) as rows
from migration_backups.audit_logs_38;

commit;
