-- =====================================================================
-- Class-BARS Migration 36: rollback
--
-- Drops the five history RPCs added by migrations/36_history_rpcs.sql:
--   get_lecturer_sessions, search_my_students, get_student_history_for_lecturer,
--   get_my_history, get_student_header_for_lecturer.
--
-- No data is changed by this migration; no backup script is needed.
-- =====================================================================

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
