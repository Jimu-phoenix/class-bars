-- =====================================================================
-- Class-BARS Migration 09: server-side role enforcement
-- Applies on top of 01–08 (and class_bars_schema_no_geo.sql).
--
-- Closes the two server-side holes left after the client-guard pass:
--
--   1. handle_new_user() honored role metadata from a hand-rolled
--      supabase.auth.signUp() call -- anyone could mint a 'lecturer' by
--      crafting the payload, and the env-based allowlist lived only in
--      the client bundle where it is trivially bypassed.
--      -> NEW authoritative table staff_email_domains (single source of
--         truth, stored in the DB, not readable/writable by clients)
--         + is_staff_email() helper + handle_new_user() now demotes any
--         non-allowlisted 'lecturer' request down to 'student'.
--
--   2. "Users insert own profile" (base schema) let ANY client INSERT
--      their own profiles row with any role value -- including 'admin'.
--      protect_profiles_role only guards UPDATE.
--      -> The INSERT policy now requires role = 'student'. The signup
--         trigger (SECURITY DEFINER, table owner) still inserts real
--         rows with whatever role handle_new_user decided.
--
-- Re-runnable (idempotent). Run in the SQL Editor as postgres.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Authoritative staff-email-domain allowlist
-- ---------------------------------------------------------------------
create table if not exists public.staff_email_domains (
  domain       text primary key,
  created_at   timestamptz not null default now()
);

alter table public.staff_email_domains enable row level security;

-- readable (anon + authenticated) so the client sign-up form can mirror
-- the same list; there are NO insert/update/delete policies, so clients
-- can never modify the allowlist (only service_role round-trips through
-- RLS bypass, which is how you manage this table).
create policy "Staff domains readable by everyone"
  on public.staff_email_domains
  for select
  using (true);

-- Seed the staff-email domain allowlist. PRODUCTION: edit this list to
-- your real staff domains (keep ONE insert per domain):
--   insert into public.staff_email_domains (domain) values ('uni.edu');
insert into public.staff_email_domains (domain)
values ('mubas.ac.mw')
on conflict (domain) do nothing;

grant select on table public.staff_email_domains to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. is_staff_email(): does this address live on an allowlisted domain?
--    SECURITY DEFINER so policies/callers see it without extra grants.
--    Domain extraction = text after the LAST '@' (matches client logic).
-- ---------------------------------------------------------------------
create or replace function public.is_staff_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_email_domains d
    where d.domain = lower(substring(p_email from '[^@]+$'))
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Hardened handle_new_user(): 'lecturer' now REQUIRES a staff email.
--    Anything else (or a non-allowlisted address) lands as 'student'.
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

  -- Honor the role chosen at signup ONLY for verified staff addresses;
  -- client metadata can never mint an admin (or a lecturer on a
  -- non-allowlisted domain anymore). protect_profiles_role() keeps the
  -- stored value immutable afterwards.
  if new.raw_user_meta_data->>'role' = 'lecturer'
     and new.email is not null
     and public.is_staff_email(new.email) then
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

-- Ensure exactly ONE signup trigger: this one.
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
-- 4. Close the client INSERT-role hole on profiles.
--    Clients may only ever create their OWN profile row as 'student'.
--    Any other role (lecturer/admin) is impossible client-side; real
--    roles are written exclusively by the SECURITY DEFINER trigger above.
-- ---------------------------------------------------------------------
drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
  on public.profiles for insert
  with check (
    auth.uid() = id
    and coalesce(role, 'student') = 'student'
  );

-- ---------------------------------------------------------------------
-- 5. Informational: existing rows that the new rules would now reject.
--    Use this to spot legacy users who need reassignment by an admin.
-- ---------------------------------------------------------------------
select
  p.id,
  u.email,
  p.role
from public.profiles p
join auth.users u on u.id = p.id
where p.role <> 'student'
  and not public.is_staff_email(u.email);