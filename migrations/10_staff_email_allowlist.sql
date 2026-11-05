-- Class-BARS Migration 10: lecturer email allowlist (replaces domains)

create table if not exists public.staff_emails (
  email       text primary key,
  created_at  timestamptz not null default now()
);

alter table public.staff_emails enable row level security;

create policy if not exists "Staff emails readable by everyone"
  on public.staff_emails
  for select
  using (true);

insert into public.staff_emails (email)
values ('lecturer@mubas.ac.mw')
on conflict (email) do nothing;

grant select on table public.staff_emails to anon, authenticated;

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


select
  p.id,
  u.email,
  p.role
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'lecturer'
  and not public.is_staff_email(u.email);
