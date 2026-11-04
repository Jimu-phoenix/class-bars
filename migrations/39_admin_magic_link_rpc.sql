-- =====================================================================
-- Class-BARS Migration 39: admin magic-link RPC (bypasses captcha)
--
-- Adds public.send_admin_magic_link(p_email text), a SECURITY DEFINER
-- RPC that sends a Supabase magic-link to an admin email via pg_net,
-- calling the Auth OTP endpoint with the service role key. This bypasses
-- client-side captcha requirements entirely: the client (AdminLogin) calls
-- supabase.rpc('send_admin_magic_link', { email }) instead of
-- supabase.auth.signInWithOtp({ email }).
--
-- Configuration: insert one row into public.app_config as postgres:
--   insert into public.app_config (key, value)
--   values
--     ('supabase_url', 'https://cyrswswqzympdxvmzmkk.supabase.co'),
--     ('service_role_key', '<your-service-role-key>'),
--     ('public_app_url', 'https://class-bars.vercel.app');
--
-- Get your service_role_key from: Supabase Dashboard → Project Settings
-- → API → service_role (secret) key. Keep it secret.
--
-- pg_net extension is required for outbound HTTP requests from PostgreSQL.
-- It is enabled in the extensions schema (same pattern as postgis).
--
-- Run order:
--   1. 39_admin_magic_link_rpc.sql (this file)
--   2. 39_admin_magic_link_rpc_rollback.sql only if needed
--
-- Re-runnable (idempotent). Run in the SQL Editor as postgres.
-- =====================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, extensions;

-- ---------------------------------------------------------------------
-- 0. pg_net extension (outbound HTTP from PostgreSQL)
-- ---------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------
-- 0b. public.app_config — server configuration key/value store.
-- No RLS policies (select is granted to authenticated for the RPC's
-- internal read; only postgres can insert/update since there are no
-- write policies and the table owner is postgres).
-- ---------------------------------------------------------------------
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);

comment on table public.app_config is
  'Server configuration key/value store. Populate as postgres before using send_admin_magic_link.';
comment on column public.app_config.key is 'Configuration key (supabase_url, service_role_key, public_app_url).';
comment on column public.app_config.value is 'Configuration value.';

grant select on table public.app_config to authenticated;

-- Seed with NULL-safe placeholders (must be replaced by the admin).
insert into public.app_config (key, value) values
  ('supabase_url',      ''),
  ('service_role_key',  ''),
  ('public_app_url',    '')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 1. send_admin_magic_link(p_email text)
-- ---------------------------------------------------------------------
create or replace function public.send_admin_magic_link(
  p_email text
) returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin_id        uuid;
  v_content_id      bigint;
  v_response        jsonb;
  v_status          int;
  v_service_role_key text;
  v_supabase_url    text;
  v_public_url      text;
begin
  -- Validate the email maps to an admin profile.
  select p.id into v_admin_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email = p_email
    and p.role = 'admin';

  if v_admin_id is null then
    raise exception 'No admin account found for this email';
  end if;

  -- Read configuration from app_config (no superuser needed).
  select value into v_supabase_url
  from public.app_config where key = 'supabase_url';

  select value into v_service_role_key
  from public.app_config where key = 'service_role_key';

  select value into v_public_url
  from public.app_config where key = 'public_app_url';

  if v_supabase_url is null or v_supabase_url = '' then
    raise exception 'Server configuration missing: set app_config.supabase_url';
  end if;

  if v_service_role_key is null or v_service_role_key = '' then
    raise exception 'Server configuration missing: set app_config.service_role_key';
  end if;

  -- Call Supabase Auth OTP endpoint with the service role key.
  -- The service role key bypasses captcha entirely.
  select pg_net.web_request(
    'POST',
    v_supabase_url || '/auth/v1/otp',
    jsonb_build_object(
      'apikey', v_service_role_key,
      'Authorization', 'Bearer ' || v_service_role_key,
      'Content-Type', 'application/json'
    ),
    jsonb_build_object(
      'email', p_email,
      'create_user', false,
      'redirect_to', coalesce(v_public_url, '') || '/admin'
    )::text
  ) into v_content_id;

  -- Wait for the outbound request to complete.
  select pg_net.web_request_wait(v_content_id) into v_response;

  -- Check the response status.
  select (v_response->>'status')::int into v_status;

  if v_status is null or v_status not in (200, 201) then
    raise exception 'Failed to send magic link (status %): %',
      v_status, coalesce(v_response->>'body', 'unknown error');
  end if;

  return 'ok';
end;
$$;

-- Only authenticated users can invoke; public/anon have no execute.
revoke all on function public.send_admin_magic_link(text) from public, anon;
grant execute on function public.send_admin_magic_link(text) to authenticated;

commit;
