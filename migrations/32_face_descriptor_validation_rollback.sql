-- =====================================================================
-- Class-BARS Migration 32: rollback
--
-- Drops the constraints and helper functions. Backup tables created by
-- 32_face_descriptor_validation_backup.sql are intentionally left in
-- migration_backups for manual review/restore.
-- =====================================================================

alter table public.face_embeddings
  drop constraint if exists face_embeddings_embedding_json_valid;

alter table public.sandbox_participants
  drop constraint if exists sandbox_participants_embedding_valid;

alter table public.sandbox_checkins
  drop constraint if exists sandbox_checkins_embedding_valid;

drop function if exists public.is_valid_face_descriptor_text(text);
drop function if exists public.is_valid_face_descriptor(jsonb);
