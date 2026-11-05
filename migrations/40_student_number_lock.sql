-- Class-BARS Migration 40: student-number lock + update_my_profile RPC

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, pg_temp;


drop function if exists public.profiles_guard_student_number();

create or replace function public.profiles_guard_student_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old text;
  v_new text;
begin
  if auth.uid() is not null then
    v_old := coalesce(btrim(old.student_number), '');
    v_new := coalesce(btrim(new.student_number), '');

    if v_old <> '' and v_new is distinct from v_old then
      raise exception 'Registration number is locked';
    end if;
  end if;

  if new.student_number is not null and btrim(new.student_number) <> '' then
    new.student_number := upper(btrim(new.student_number));
    if length(new.student_number) > 30 then
      raise exception 'Registration number must be 30 characters or fewer';
    end if;
  elsif new.student_number is not null and btrim(new.student_number) = '' then
    raise exception 'Registration number cannot be empty';
  end if;

  return new;
end;
$$;

comment on function public.profiles_guard_student_number() is
  'BEFORE UPDATE trigger on profiles: locks student_number once set (client sessions only). Normalises new values (btrim + upper), rejects empty/long values.';


drop trigger if exists trg_protect_profiles_student_number on public.profiles;
create trigger trg_protect_profiles_student_number
  before update on public.profiles
  for each row
  execute function public.profiles_guard_student_number();


drop function if exists public.update_my_profile(text, text, text);

create or replace function public.update_my_profile(
  p_full_name     text,
  p_phone_number  text,
  p_student_number text default null
) returns table (
  id              uuid,
  full_name       text,
  role            user_role,
  student_number  text,
  phone_number    text,
  consent_given_at timestamptz,
  consent_version text,
  created_at      timestamptz,
  updated_at      timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid                uuid := auth.uid();
  v_role               user_role;
  v_old                profiles%rowtype;
  v_new_full_name      text;
  v_new_phone          text;
  v_new_student_number text;
  v_changed_fields     text[] := array[]::text[];
  v_student_number_set boolean := false;
  v_row                profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_old
  from public.profiles
  where public.profiles.id = v_uid;

  if not found then
    raise exception 'Profile not found';
  end if;

  v_role := v_old.role;

  v_new_full_name := trim(coalesce(p_full_name, ''));
  if v_new_full_name = '' then
    raise exception 'Full name is required';
  end if;
  if length(v_new_full_name) < 2 then
    raise exception 'Full name must be at least 2 characters';
  end if;
  if length(v_new_full_name) > 100 then
    raise exception 'Full name must be 100 characters or fewer';
  end if;

  if trim(coalesce(p_phone_number, '')) = '' then
    v_new_phone := null;
  else
    v_new_phone := trim(p_phone_number);
    if length(v_new_phone) < 7 then
      raise exception 'Phone number must be at least 7 characters';
    end if;
    if length(v_new_phone) > 20 then
      raise exception 'Phone number must be 20 characters or fewer';
    end if;
    if v_new_phone !~ '^[0-9 +\-]+$' then
      raise exception 'Phone number may only contain digits, spaces, + and -';
    end if;
  end if;

  if v_role = 'student' then
    if v_old.student_number is null or btrim(v_old.student_number) = '' then
      if p_student_number is not null and btrim(p_student_number) <> '' then
        v_new_student_number := upper(btrim(p_student_number));
        if length(v_new_student_number) > 30 then
          raise exception 'Registration number must be 30 characters or fewer';
        end if;
        v_student_number_set := true;
      else
        v_new_student_number := v_old.student_number;
      end if;
    else
      if p_student_number is not null and btrim(p_student_number) <> '' then
        if upper(btrim(p_student_number)) is distinct from upper(btrim(v_old.student_number)) then
          raise exception 'Registration number is locked';
        end if;
        v_new_student_number := v_old.student_number;
      else
        v_new_student_number := v_old.student_number;
      end if;
    end if;
  else
    v_new_student_number := v_old.student_number;
  end if;

  if v_new_full_name is distinct from v_old.full_name then
    v_changed_fields := array_append(v_changed_fields, 'full_name');
  end if;
  if v_new_phone is distinct from v_old.phone_number then
    v_changed_fields := array_append(v_changed_fields, 'phone_number');
  end if;
  if v_role = 'student' and v_new_student_number is distinct from v_old.student_number then
    v_changed_fields := array_append(v_changed_fields, 'student_number');
  end if;

  update public.profiles
  set full_name = v_new_full_name,
      phone_number = v_new_phone,
      student_number = v_new_student_number,
      updated_at = now()
  where public.profiles.id = v_uid
  returning * into v_row;

  if cardinality(v_changed_fields) > 0 then
    perform public.write_audit_log(
      'profile_updated',
      'profile',
      v_row.id,
      jsonb_build_object('fields', v_changed_fields),
      v_uid
    );
  end if;

  if v_student_number_set then
    perform public.write_audit_log(
      'student_number_set',
      'profile',
      v_row.id,
      jsonb_build_object('student_number_set', true),
      v_uid
    );
  end if;

  return query
  select
    v_row.id,
    v_row.full_name,
    v_row.role,
    v_row.student_number,
    v_row.phone_number,
    v_row.consent_given_at,
    v_row.consent_version,
    v_row.created_at,
    v_row.updated_at;

exception
  when unique_violation then
    raise exception 'This registration number is already registered';
end;
$$;

revoke all on function public.update_my_profile(text, text, text) from public, anon;
grant execute on function public.update_my_profile(text, text, text) to authenticated;

comment on function public.update_my_profile(text, text, text) is
  'Students update name/phone (always) and set student_number once (locked thereafter). SECURITY DEFINER, authenticated execute only.';

commit;
