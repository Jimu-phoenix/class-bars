-- Class-BARS Migration 38: audit-log actor (user_agent) + new event types

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, pg_temp;

create or replace function public.write_audit_log(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid,
  p_metadata    jsonb,
  p_actor_id    uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ua      text;
  v_ip      text;
  v_ip_inet inet;
  v_headers jsonb;
begin
  begin
    v_headers := current_setting('request.headers', true);
    if v_headers is not null then
      v_headers := v_headers::jsonb;
      v_ua := nullif(trim(v_headers->>'user-agent'), '');
      v_ip := nullif(
        trim(
          split_part(
            coalesce(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip'),
            ',',
            1
          )
        ),
        ''
      );
    end if;
  exception when others then
    v_headers := null;
    v_ua := null;
    v_ip := null;
  end;

  if v_ua is not null then
    v_ua := left(v_ua, 512);
  end if;

  v_ip_inet := null;
  if v_ip is not null then
    begin
      v_ip_inet := v_ip::inet;
    exception when others then
      v_ip_inet := null;
    end;
  end if;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata,
    ip_address,
    user_agent,
    created_at
  ) values (
    p_actor_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_metadata,
    v_ip_inet,
    v_ua,
    now()
  );
end;
$$;

revoke all on function public.write_audit_log(
  text, text, uuid, jsonb, uuid
) from public, anon, authenticated;

create or replace function public.get_user_emails(
  user_ids uuid[]
) returns table (
  user_id uuid,
  email   text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select u.id, u.email::text
  from auth.users u
  where u.id = any(user_ids);
end;
$$;

revoke all on function public.get_user_emails(uuid[]) from public, anon;
grant execute on function public.get_user_emails(uuid[]) to authenticated;


create or replace function public.trg_audit_session_started()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.write_audit_log(
    'session_started',
    'class_session',
    new.id,
    jsonb_build_object('course_id', new.course_id, 'venue_id', new.venue_id),
    new.lecturer_id
  );
  return new;
exception when others then
  raise warning 'audit_log(session_started) failed: %', sqlerrm;
  return new;
end;
$$;

create or replace function public.trg_audit_account_created()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.write_audit_log(
    'account_created',
    'profiles',
    new.id,
    jsonb_build_object('role', new.role),
    new.id
  );
  return new;
exception when others then
  raise warning 'audit_log(account_created) failed: %', sqlerrm;
  return new;
end;
$$;

create or replace function public.trg_audit_venue_created()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.write_audit_log(
    'venue_created',
    'venues',
    new.id,
    jsonb_build_object('name', new.name),
    auth.uid()
  );
  return new;
exception when others then
  raise warning 'audit_log(venue_created) failed: %', sqlerrm;
  return new;
end;
$$;

create or replace function public.trg_audit_lecturer_email_added()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.write_audit_log(
    'lecturer_email_added',
    'staff_email',
    null,
    jsonb_build_object('email', new.email),
    auth.uid()
  );
  return new;
exception when others then
  raise warning 'audit_log(lecturer_email_added) failed: %', sqlerrm;
  return new;
end;
$$;


drop trigger if exists trg_audit_session_started on public.class_sessions;
create trigger trg_audit_session_started
  after insert on public.class_sessions
  for each row
  when (new.status = 'ongoing')
  execute function public.trg_audit_session_started();

drop trigger if exists trg_audit_session_status_ongoing on public.class_sessions;
create trigger trg_audit_session_status_ongoing
  after update on public.class_sessions
  for each row
  when (
    new.status = 'ongoing'
    and old.status is distinct from new.status
  )
  execute function public.trg_audit_session_started();

drop trigger if exists trg_audit_account_created on public.profiles;
create trigger trg_audit_account_created
  after insert on public.profiles
  for each row
  execute function public.trg_audit_account_created();

drop trigger if exists trg_audit_venue_created on public.venues;
create trigger trg_audit_venue_created
  after insert on public.venues
  for each row
  execute function public.trg_audit_venue_created();

drop trigger if exists trg_audit_lecturer_email_added on public.staff_emails;
create trigger trg_audit_lecturer_email_added
  after insert on public.staff_emails
  for each row
  execute function public.trg_audit_lecturer_email_added();


create index if not exists idx_audit_logs_action_created_at
  on public.audit_logs (action, created_at desc);

commit;
