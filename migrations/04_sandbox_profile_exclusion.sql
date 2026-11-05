-- Class-BARS Migration 04: keep sandbox identities out of profiles

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

delete from public.profiles p
using auth.users u
where p.id = u.id
  and (
    u.is_anonymous
    or coalesce(u.raw_user_meta_data->>'role', '') like 'sandbox%'
  );
