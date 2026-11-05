-- Class-BARS Migration 09: server-side role enforcement

create table if not exists public.staff_email_domains (
  domain       text primary key,
  created_at   timestamptz not null default now()
);

alter table public.staff_email_domains enable row level security;

create policy "Staff domains readable by everyone"
  on public.staff_email_domains
  for select
  using (true);

insert into public.staff_email_domains (domain)
values ('mubas.ac.mw')
on conflict (domain) do nothing;

grant select on table public.staff_email_domains to anon, authenticated;

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role := 'student';
begin
  if new.is_anonymous
     or coalesce(new.raw_user_meta_data->>'role', '') like 'sandbox%' then
    return new;
  end if;

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

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
  on public.profiles for insert
  with check (
    auth.uid() = id
    and coalesce(role, 'student') = 'student'
  );

select
  p.id,
  u.email,
  p.role
from public.profiles p
join auth.users u on u.id = p.id
where p.role <> 'student'
  and not public.is_staff_email(u.email);