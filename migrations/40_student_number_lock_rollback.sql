-- Class-BARS Migration 40: rollback


begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, pg_temp;

drop trigger if exists trg_protect_profiles_student_number on public.profiles;

drop function if exists public.profiles_guard_student_number();

revoke all on function public.update_my_profile(text, text, text) from public, anon, authenticated;
drop function if exists public.update_my_profile(text, text, text);

commit;
