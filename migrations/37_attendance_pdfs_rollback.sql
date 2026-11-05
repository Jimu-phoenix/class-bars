-- Class-BARS Migration 37: migration 37


begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, pg_temp;

revoke all on function public.record_attendance_pdf(uuid, text) from public, anon, authenticated;
revoke all on function public.verify_attendance_pdf(text) from public, anon, authenticated;

drop function if exists public.record_attendance_pdf(uuid, text);
drop function if exists public.verify_attendance_pdf(text);
drop table if exists public.attendance_pdfs;

commit;
