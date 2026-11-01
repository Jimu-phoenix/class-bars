-- =====================================================================
-- Class-BARS Migration 32: validate existing rows
--
-- Run only after the preflight report shows zero invalid rows in each
-- table. If any invalid row remains, VALIDATE will fail.
-- =====================================================================

alter table public.face_embeddings
  validate constraint face_embeddings_embedding_json_valid;

alter table public.sandbox_participants
  validate constraint sandbox_participants_embedding_valid;

alter table public.sandbox_checkins
  validate constraint sandbox_checkins_embedding_valid;
