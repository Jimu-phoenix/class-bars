-- =====================================================================
-- Class-BARS Migration 34: backup before consent + account deletion
--
-- Run this BEFORE 34_consent_and_account_deletion.sql. Backup tables live
-- in migration_backups and are not used by the app.
--
-- Hardening: transactional, fresh (drop+recreate) backup tables every run.
-- The profiles backup uses SELECT * so it does NOT reference consent
-- columns (they do not exist yet at backup time).
-- =====================================================================

begin;

set lock_timeout = '5s';
set statement_timeout = '30s';

create schema if not exists migration_backups;

-- Fresh profiles backup (SELECT * -- no consent columns exist yet).
drop table if exists migration_backups.profiles_34;
create table migration_backups.profiles_34
  as select * from public.profiles;

-- Fresh attendance_records backup (pre-anonymisation snapshot).
drop table if exists migration_backups.attendance_records_34;
create table migration_backups.attendance_records_34
  as select * from public.attendance_records;

-- Keep backup tables read-only snapshots.
revoke all on table migration_backups.profiles_34 from public, anon, authenticated;
revoke all on table migration_backups.attendance_records_34 from public, anon, authenticated;

select 'profiles_34' as backup_table, count(*) as rows
from migration_backups.profiles_34;

select 'attendance_records_34' as backup_table, count(*) as rows
from migration_backups.attendance_records_34;

do $$
begin
  raise notice 'migration_backups.profiles_34 and attendance_records_34 created';
end
$$;

commit;
