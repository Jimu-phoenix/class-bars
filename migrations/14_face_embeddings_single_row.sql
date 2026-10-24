-- =====================================================================
-- Class-BARS Migration 14: One face embedding per student (update-in-place)
--
-- Replace upsert_face_embedding to keep a single row per user and only
-- update embedding_json/model_version/updated_at. No history of old rows.
--
-- Re-runnable (idempotent). Run in the SQL Editor as postgres.
-- =====================================================================

create or replace function public.upsert_face_embedding(
  p_embedding jsonb,
  p_model_version text
) returns face_embeddings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row face_embeddings;
begin
  if p_embedding is null or jsonb_typeof(p_embedding) <> 'array' then
    raise exception 'embedding must be a JSON array';
  end if;

  -- Update existing row for this user if present
  update face_embeddings
  set embedding_json = p_embedding,
      model_version   = coalesce(nullif(trim(p_model_version), ''), model_version),
      is_active       = true,
      updated_at      = now()
  where user_id = auth.uid()
  returning * into v_row;

  if v_row.id is not null then
    return v_row;
  end if;

  -- Create first row for this user
  insert into face_embeddings (user_id, embedding_json, model_version, is_active)
  values (
    auth.uid(),
    p_embedding,
    coalesce(nullif(trim(p_model_version), ''), 'unknown'),
    true
  )
  returning * into v_row;

  return v_row;
end;
$$;
