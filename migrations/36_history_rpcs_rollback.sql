-- Class-BARS Migration 36: rollback


begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, pg_temp;

do $$
begin
  if to_regprocedure('public.get_lecturer_sessions(uuid,int,int)') is not null then
    revoke execute on function public.get_lecturer_sessions(uuid, int, int)
    from public, anon, authenticated;
    drop function public.get_lecturer_sessions(uuid, int, int);
  end if;
end
$$;

do $$
begin
  if to_regprocedure('public.search_my_students(text,int)') is not null then
    revoke execute on function public.search_my_students(text, int)
    from public, anon, authenticated;
    drop function public.search_my_students(text, int);
  end if;
end
$$;

do $$
begin
  if to_regprocedure('public.list_my_students()') is not null then
    revoke execute on function public.list_my_students()
    from public, anon, authenticated;
    drop function public.list_my_students();
  end if;
end
$$;

do $$
begin
  if to_regprocedure('public.get_student_history_for_lecturer(uuid,uuid)') is not null then
    revoke execute on function public.get_student_history_for_lecturer(uuid, uuid)
    from public, anon, authenticated;
    drop function public.get_student_history_for_lecturer(uuid, uuid);
  end if;
end
$$;

do $$
begin
  if to_regprocedure('public.get_my_history(uuid)') is not null then
    revoke execute on function public.get_my_history(uuid)
    from public, anon, authenticated;
    drop function public.get_my_history(uuid);
  end if;
end
$$;

do $$
begin
  if to_regprocedure('public.get_student_header_for_lecturer(uuid)') is not null then
    revoke execute on function public.get_student_header_for_lecturer(uuid)
    from public, anon, authenticated;
    drop function public.get_student_header_for_lecturer(uuid);
  end if;
end
$$;

commit;
