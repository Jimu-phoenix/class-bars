-- Class-BARS Migration 32: backup before validation


create schema if not exists migration_backups;

create table if not exists migration_backups.face_embeddings_32
  as select * from public.face_embeddings;

create table if not exists migration_backups.sandbox_participants_32
  as select * from public.sandbox_participants;

create table if not exists migration_backups.sandbox_checkins_32
  as select * from public.sandbox_checkins;

select 'face_embeddings_32' as backup_table, count(*) as rows
from migration_backups.face_embeddings_32
union all
select 'sandbox_participants_32', count(*)
from migration_backups.sandbox_participants_32
union all
select 'sandbox_checkins_32', count(*)
from migration_backups.sandbox_checkins_32;
