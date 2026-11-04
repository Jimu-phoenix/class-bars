-- =====================================================================
-- Class-BARS Migration 39: rollback
--
-- Drops public.send_admin_magic_link(), public.app_config table, and
-- the pg_net extension (if no other migration depends on it).
-- =====================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, extensions;

-- Revoke before dropping.
do $$
begin
  if to_regprocedure('public.send_admin_magic_link(text)') is not null then
    revoke all on function public.send_admin_magic_link(text) from public, anon, authenticated;
  end if;
end
$$;

drop function if exists public.send_admin_magic_link(text);

drop table if exists public.app_config;

-- Drop pg_net extension (idempotent; only if nothing else uses it).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    drop extension if exists pg_net;
  end if;
end
$$;

commit;
