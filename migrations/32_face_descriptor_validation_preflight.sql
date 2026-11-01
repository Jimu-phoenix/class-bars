-- =====================================================================
-- Class-BARS Migration 32: preflight report
--
-- Run AFTER 32_face_descriptor_validation.sql and BEFORE the validate
-- script. This reports invalid rows without changing them.
-- =====================================================================

select 'face_embeddings' as source,
       count(*) as total_rows,
       count(*) filter (
         where not public.is_valid_face_descriptor_text(embedding_json::text)
       ) as invalid_rows
from public.face_embeddings
union all
select 'sandbox_participants',
       count(*),
       count(*) filter (
         where not public.is_valid_face_descriptor_text(embedding)
       )
from public.sandbox_participants
union all
select 'sandbox_checkins',
       count(*),
       count(*) filter (
         where embedding is not null
           and not public.is_valid_face_descriptor_text(embedding)
       )
from public.sandbox_checkins;

select id,
       user_id,
       model_version,
       updated_at,
       left(embedding_json::text, 200) as embedding_preview
from public.face_embeddings
where not public.is_valid_face_descriptor_text(embedding_json::text)
order by updated_at desc;

select participant_id,
       display_name,
       updated_at,
       left(embedding, 200) as embedding_preview
from public.sandbox_participants
where not public.is_valid_face_descriptor_text(embedding)
order by updated_at desc;

select id,
       session_id,
       participant_id,
       display_name,
       created_at,
       left(embedding, 200) as embedding_preview
from public.sandbox_checkins
where embedding is not null
  and not public.is_valid_face_descriptor_text(embedding)
order by created_at desc;
