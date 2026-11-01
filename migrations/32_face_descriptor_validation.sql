-- =====================================================================
-- Class-BARS Migration 32: validate stored face descriptors
--
-- Adds immutable validation helpers and NOT VALID CHECK constraints for
-- real and sandbox face templates. Existing rows are NOT scanned by this
-- migration; run the preflight report, clean invalid rows, then run the
-- validate script.
--
-- Run order:
--   1. 32_face_descriptor_validation_backup.sql
--   2. 32_face_descriptor_validation.sql (this file)
--   3. 32_face_descriptor_validation_preflight.sql
--   4. clean invalid rows (manual review)
--   5. 32_face_descriptor_validation_validate.sql
--   6. 32_face_descriptor_validation_rollback.sql only if needed
--
-- Apply to a Supabase branch/staging project first. Do not run this
-- against production until the preflight output has been reviewed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Validate a jsonb descriptor: exactly 128 finite JSON numbers, non-zero
-- norm. jsonb numbers cannot be NaN/Infinity, so jsonb_typeof = 'number'
-- plus a numeric sum is sufficient.
-- ---------------------------------------------------------------------
create or replace function public.is_valid_face_descriptor(
  p_descriptor jsonb
) returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_element jsonb;
  v_sum numeric := 0;
begin
  if p_descriptor is null or jsonb_typeof(p_descriptor) <> 'array' then
    return false;
  end if;

  if jsonb_array_length(p_descriptor) <> 128 then
    return false;
  end if;

  for v_element in
    select elem.value
    from jsonb_array_elements(p_descriptor) as elem(value)
  loop
    if jsonb_typeof(v_element) <> 'number' then
      return false;
    end if;
    v_sum := v_sum + ((v_element #>> '{}')::numeric * (v_element #>> '{}')::numeric);
  end loop;

  return v_sum > 0;
end;
$$;

comment on function public.is_valid_face_descriptor(jsonb) is
  'True for a 128-element JSON number array with a non-zero norm.';

-- ---------------------------------------------------------------------
-- Safe text wrapper for columns that may be text or jsonb. Invalid JSON
-- returns false instead of raising.
-- ---------------------------------------------------------------------
create or replace function public.is_valid_face_descriptor_text(
  p_descriptor text
) returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_descriptor jsonb;
begin
  if p_descriptor is null or btrim(p_descriptor) = '' then
    return false;
  end if;

  begin
    v_descriptor := p_descriptor::jsonb;
  exception
    when others then
      return false;
  end;

  return public.is_valid_face_descriptor(v_descriptor);
end;
$$;

comment on function public.is_valid_face_descriptor_text(text) is
  'Safe text/jsonb descriptor validator; malformed JSON returns false.';

-- ---------------------------------------------------------------------
-- Real face templates. NOT VALID means existing rows are not scanned.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'face_embeddings_embedding_json_valid'
      and conrelid = 'public.face_embeddings'::regclass
  ) then
    alter table public.face_embeddings
      add constraint face_embeddings_embedding_json_valid
      check (public.is_valid_face_descriptor_text(embedding_json::text))
      not valid;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- Sandbox templates. Both columns are text, so use the safe wrapper.
-- sandbox_checkins.embedding is nullable by design.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sandbox_participants_embedding_valid'
      and conrelid = 'public.sandbox_participants'::regclass
  ) then
    alter table public.sandbox_participants
      add constraint sandbox_participants_embedding_valid
      check (public.is_valid_face_descriptor_text(embedding))
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sandbox_checkins_embedding_valid'
      and conrelid = 'public.sandbox_checkins'::regclass
  ) then
    alter table public.sandbox_checkins
      add constraint sandbox_checkins_embedding_valid
      check (
        embedding is null
        or public.is_valid_face_descriptor_text(embedding)
      )
      not valid;
  end if;
end
$$;
