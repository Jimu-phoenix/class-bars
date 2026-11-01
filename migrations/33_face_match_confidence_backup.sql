-- =====================================================================
-- Class-BARS Migration 33: backup before applying face match confidence
--
-- Run this BEFORE 33_face_match_confidence.sql. Backup tables live in the
-- migration_backups schema and are not used by the app.
--
-- Hardening: runs inside a transaction, recreates backup tables fresh on
-- every run (so they always reflect the current live state), copies the
-- full attendance row including match_* columns (once migration 33 adds
-- them), and revokes access to the backup tables so they remain read-only
-- snapshots. The face_match_config backup is optional -- it only exists
-- if migration 33 has already been applied.
-- =====================================================================

begin;

set lock_timeout = '5s';
set statement_timeout = '30s';

create schema if not exists migration_backups;

-- Fresh attendance backup (includes match_distance/match_score/match_band/
-- match_config_version once migration 33 columns exist).
drop table if exists migration_backups.attendance_records_33;
create table migration_backups.attendance_records_33
  as select * from public.attendance_records;

-- Fresh face_match_config backup, only if the table already exists
-- (i.e. migration 33 was previously applied and is being re-run).
do $$
begin
  if to_regclass('public.face_match_config') is not null then
    drop table if exists migration_backups.face_match_config_33;
    create table migration_backups.face_match_config_33
      as select * from public.face_match_config;
  end if;
end
$$;

-- Fresh function-definition backup covering every function migration 33
-- touches or replaces, so a rollback can restore exact prior definitions.
drop table if exists migration_backups.functions_33;
create table migration_backups.functions_33
  as select
    p.oid::regprocedure::text as signature,
    pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'check_in_attendance',
      '_check_in_attendance',
      'get_session_attendance',
      'face_match_score',
      'set_face_match_config'
    );

-- Keep backup tables read-only snapshots.
revoke all on table migration_backups.attendance_records_33 from public, anon, authenticated;
do $$
begin
  if to_regclass('migration_backups.face_match_config_33') is not null then
    revoke all on table migration_backups.face_match_config_33 from public, anon, authenticated;
  end if;
end
$$;
revoke all on table migration_backups.functions_33 from public, anon, authenticated;

select 'attendance_records_33' as backup_table, count(*) as rows
from migration_backups.attendance_records_33;

do $$
begin
  if to_regclass('migration_backups.face_match_config_33') is not null then
    raise notice 'face_match_config_33 backup exists';
  else
    raise notice 'face_match_config_33 backup not needed (table did not exist)';
  end if;
end
$$;

commit;
