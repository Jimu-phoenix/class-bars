-- =====================================================================
-- Class-BARS Migration 14: One face embedding per student (update-in-place)
--
-- Replace upsert_face_embedding to keep a single row per user and only
-- update embedding_json/model_version/updated_at. No history of old rows.
-- Prunes duplicate/stale rows to prevent 409 unique_violation conflicts
-- against idx_face_embeddings_active_user.
--
-- Re-runnable (idempotent). Run in the SQL Editor as postgres.
-- =====================================================================

-- Clean up any older/duplicate rows across all users, keeping only the single newest one
delete from public.face_embeddings
where id not in (
  select distinct on (user_id) id
  from public.face_embeddings
  order by user_id, is_active desc, updated_at desc, created_at desc
);

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

  -- Clean up any extra rows for this user, keeping at most the single newest one
  delete from face_embeddings
  where user_id = auth.uid()
    and id not in (
      select id from face_embeddings
      where user_id = auth.uid()
      order by is_active desc, updated_at desc, created_at desc
      limit 1
    );

  -- Update existing row for this user if present
  update face_embeddings
  set embedding_json = p_embedding,
      model_version  = coalesce(nullif(trim(p_model_version), ''), model_version),
      is_active      = true,
      updated_at     = now()
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
