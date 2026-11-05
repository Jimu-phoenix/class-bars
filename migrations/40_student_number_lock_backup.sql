-- =====================================================================
-- Class-BARS Migration 40: backup before student-number lock
--
-- Run this BEFORE 40_student_number_lock.sql. Snapshot profiles so any
-- pre-existing student_number values can be reviewed if the lock trigger
-- needs to be audited later.
-- =====================================================================

begin;

set lock_timeout = '5s';
set statement_timeout = '30s';

create schema if not exists migration_backups;

drop table if exists migration_backups.profiles_40;
create table migration_backups.profiles_40
  as select * from public.profiles;

revoke all on table migration_backups.profiles_40 from public, anon, authenticated;

select 'profiles_40' as backup_table, count(*) as rows
from migration_backups.profiles_40;

commit;
