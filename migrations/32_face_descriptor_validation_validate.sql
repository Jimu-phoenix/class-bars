-- Class-BARS Migration 32: validate existing rows


alter table public.face_embeddings
  validate constraint face_embeddings_embedding_json_valid;

alter table public.sandbox_participants
  validate constraint sandbox_participants_embedding_valid;

alter table public.sandbox_checkins
  validate constraint sandbox_checkins_embedding_valid;
