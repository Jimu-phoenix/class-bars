-- Class-BARS Migration 33: backup before applying face match confidence

begin;

set lock_timeout = '5s';
set statement_timeout = '30s';

create schema if not exists migration_backups;

drop table if exists migration_backups.attendance_records_33;
create table migration_backups.attendance_records_33
  as select * from public.attendance_records;

do $$
begin
  if to_regclass('public.face_match_config') is not null then
    drop table if exists migration_backups.face_match_config_33;
    create table migration_backups.face_match_config_33
      as select * from public.face_match_config;
  end if;
end
$$;

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
