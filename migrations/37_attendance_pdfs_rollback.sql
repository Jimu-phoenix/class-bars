-- =====================================================================
-- Class-BARS Migration 37 rollback: verifiable attendance register PDFs
--
-- Drops the verify and record functions, revokes their privileges, and
-- drops the public.attendance_pdfs table.
--
-- WARNING: this invalidates every PDF already issued (their verification
-- codes will no longer resolve).
--
-- Re-runnable. Run in the SQL Editor as postgres.
-- =====================================================================

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
