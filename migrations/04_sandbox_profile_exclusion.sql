-- =====================================================================
-- Class-BARS Migration 04: keep sandbox identities out of profiles
-- Applies on top of 01 / 02. Fixes live-project drift: an untracked
-- `on_auth_user_created` trigger (the standard Supabase template)
-- existed only in the dashboard and inserted EVERY new auth user into
-- public.profiles -- including Anonymous Auth sandbox guests -- always
-- as 'student'.
--
-- What this migration does:
--   A. Inspect: show the triggers currently bound to auth.users
--      (read-only grid; informational -- section C replaces whatever
--      it finds, regardless of naming).
--   B. Replace public.handle_new_user():
--        - anonymous users (is_anonymous / sandbox_* metadata role)
--          return early: NO profile row is created (spec 02 §5 --
--          sandbox identities are throwaway and never linked to
--          real accounts);
--        - real signups get their metadata role honored
--          ('lecturer' -> lecturer, anything else -> student;
--          'admin' can NEVER come from client metadata).
--   C. Sweep every user-created trigger off auth.users and rebind a
--      single on_auth_user_created -> handle_new_user, so an old
--      differently-named dashboard trigger cannot double-insert.
--   D. Cleanup: delete already-created profile rows belonging to
--      anonymous/sandbox users (idempotent; nothing legitimate
--      references them -- attendance/enrollments cascade away and
--      sandbox guests have none).
--
-- Re-runnable: replaces the function and drops/recreates its trigger.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Inspection: what listens on auth.users today?
--    Informational grid (runs before B/C/D mutate anything). Expected
--    today: one non-internal trigger, typically named
--    on_auth_user_created and backed by public.handle_new_user.
--    Whatever this shows, section C replaces it deterministically.
-- ---------------------------------------------------------------------
select
  c.relname                    as table_name,
  t.tgname                     as trigger_name,
  p.proname                    as function_name,
  pg_get_functiondef(p.oid)    as function_source
from pg_trigger t
join pg_class c     on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p      on p.oid = t.tgfoid
where n.nspname = 'auth'
  and c.relname = 'users'
  and not t.tgisinternal
order by t.tgname;

-- ---------------------------------------------------------------------
-- B. New handle_new_user body
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role := 'student';
begin
  -- Throwaway identities (Anonymous Auth / sandbox guests) never get
  -- real profile rows. Sandbox sessions/checkins store their uuids
  -- without any FK into profiles precisely for this reason.
  if new.is_anonymous
     or coalesce(new.raw_user_meta_data->>'role', '') like 'sandbox%' then
    return new;
  end if;

  -- Honor the role chosen at signup; client metadata can never mint
  -- an admin. protect_profiles_role() keeps it immutable afterwards.
  if new.raw_user_meta_data->>'role' = 'lecturer' then
    v_role := 'lecturer';
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'User'
    ),
    v_role
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- C. Ensure exactly ONE signup trigger: this one.
--    Sweeps away ANY other user-created trigger on auth.users so the
--    new handler cannot race an old one into duplicate-profile key
--    violations. Internal Supabase triggers (tgisinternal) are never
--    touched. Check grid A to see what existed beforehand.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select t.tgname
    from pg_trigger t
    join pg_class c     on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth'
      and c.relname = 'users'
      and not t.tgisinternal
  loop
    execute format('drop trigger if exists %I on auth.users', r.tgname);
  end loop;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- D. Remove profile rows already created for sandbox guests
--    Scoped tightly to anonymous users so no real account is touched.
-- ---------------------------------------------------------------------
delete from public.profiles p
using auth.users u
where p.id = u.id
  and (
    u.is_anonymous
    or coalesce(u.raw_user_meta_data->>'role', '') like 'sandbox%'
  );
