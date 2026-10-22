-- =====================================================================
-- Class-BARS Migration 10: lecturer email allowlist (replaces domains)
-- Applies on top of 01–09.
--
-- Switches the lecturer allowlist from domain-based matching
-- (staff_email_domains) to exact-email matching (staff_emails).
--
--   - NEW table public.staff_emails: individual staff emails, PK = email
--   - is_staff_email() now checks staff_emails (exact, case-insensitive)
--   - handle_new_user() calls is_staff_email(), so it automatically
--     requires an allowlisted email for role = 'lecturer'
--   - Client rolePolicy.ts mirrors the same table for fail-fast UX
--
-- Re-runnable (idempotent). Run in the SQL Editor as postgres.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Lecturer email allowlist table
-- ---------------------------------------------------------------------
create table if not exists public.staff_emails (
  email       text primary key,
  created_at  timestamptz not null default now()
);

alter table public.staff_emails enable row level security;

-- Readable by everyone so the client sign-up form can mirror the list.
-- No insert/update/delete policies: clients can never modify it.
create policy if not exists "Staff emails readable by everyone"
  on public.staff_emails
  for select
  using (true);

-- Seed with example addresses. PRODUCTION: edit this list.
insert into public.staff_emails (email)
values ('lecturer@mubas.ac.mw')
on conflict (email) do nothing;

grant select on table public.staff_emails to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. is_staff_email(): exact-email match against staff_emails
--    SECURITY DEFINER so policies/callers see it without extra grants.
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
    from public.staff_emails e
    where lower(e.email) = lower(p_email)
  );
$$;

-- ---------------------------------------------------------------------
-- 3. handle_new_user() already calls public.is_staff_email(new.email),
--    so it now requires an allowlisted *email* for lecturer role.
--    No change needed here — the function swap above flips it.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 4. Informational: legacy lecturer profiles whose email is not on the
--    allowlist. handle_new_user() demoted them to student at signup;
--    existing rows keep whatever role they had until an admin repairs.
-- ---------------------------------------------------------------------
select
  p.id,
  u.email,
  p.role
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'lecturer'
  and not public.is_staff_email(u.email);
