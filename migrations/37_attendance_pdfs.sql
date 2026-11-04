-- =====================================================================
-- Class-BARS Migration 37: verifiable attendance register PDFs
--
-- New data-only table public.attendance_pdfs plus two SECURITY DEFINER
-- RPCs so lecturers can register a PDF verification code and anyone can
-- verify it publicly.
--
--   record_attendance_pdf(p_course_id, p_pdf_code) -> (id, created_at)
--     lecturer-owned course only; one row per unique 6-char code;
--     writes an audit_logs row with course_id only in metadata.
--   verify_attendance_pdf(p_code) -> (course_code, course_name, created_at)
--     public (anon + authenticated); returns nothing for malformed codes.
--
-- No existing table or RPC is changed, so no backup script is needed.
-- WARNING: rolling back drops attendance_pdfs and invalidates every PDF
-- already issued (their verification codes will no longer resolve).
--
-- Re-runnable. Run in the SQL Editor as postgres on a branch/staging
-- project first. Do NOT apply to production until reviewed.
-- =====================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = public, pg_temp;

-- ---------------------------------------------------------------------
-- 1. public.attendance_pdfs
-- One row per issued register verification code. course_id is nullable
-- (ON DELETE SET NULL) so a verified PDF stays verifiable if its course
-- is later deleted. All access goes through the two functions below:
-- RLS is enabled with no policies and all privileges are revoked.
-- ---------------------------------------------------------------------

create table if not exists public.attendance_pdfs (
  id         uuid      primary key default gen_random_uuid(),
  course_id  uuid      references public.courses(id) on delete set null,
  pdf_code   text      not null unique,
  created_at timestamptz not null default now(),
  constraint attendance_pdfs_pdf_code_format
    check (pdf_code ~ '^[A-HJ-NP-Z2-9]{6}$')
);

alter table public.attendance_pdfs enable row level security;

revoke all on table public.attendance_pdfs from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. record_attendance_pdf(p_course_id, p_pdf_code) -> (id, created_at)
-- The caller must be an authenticated lecturer who owns the course.
-- The code is trimmed and upper-cased, must match the 6-char alphabet
-- regex, and must be unique. On success an audit_logs row is written
-- (action register.exported, course_id only in metadata).
-- ---------------------------------------------------------------------

drop function if exists public.record_attendance_pdf(uuid, text);

create or replace function public.record_attendance_pdf(
  p_course_id uuid,
  p_pdf_code  text
) returns table (
  id         uuid,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_course      public.courses;
  v_code        text;
  v_id          uuid;
  v_created_at  timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_lecturer_user() then
    raise exception 'Only lecturers can register attendance PDFs';
  end if;

  select *
  into v_course
  from public.courses
  where public.courses.id = p_course_id;

  if v_course.id is null then
    raise exception 'Course not found or not owned by you';
  end if;

  if v_course.lecturer_id is distinct from auth.uid() then
    raise exception 'Course not found or not owned by you';
  end if;

  v_code := upper(trim(coalesce(p_pdf_code, '')))::text;
  if v_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    raise exception 'invalid_pdf_code';
  end if;

  begin
    insert into public.attendance_pdfs (course_id, pdf_code)
    values (p_course_id, v_code)
    returning public.attendance_pdfs.id, public.attendance_pdfs.created_at
    into v_id, v_created_at;
  exception when unique_violation then
    raise exception 'pdf_code_taken';
  end;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    'register.exported',
    'attendance_pdfs',
    v_id,
    jsonb_build_object('course_id', p_course_id::text)
  );

  return query
  select v_id::uuid as id, v_created_at as created_at;
end;
$$;

revoke all on function public.record_attendance_pdf(uuid, text) from public, anon;
grant execute on function public.record_attendance_pdf(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. verify_attendance_pdf(p_code) -> (course_code, course_name, created_at)
-- Public verification. Malformed input returns no rows (no error, no
-- table access). Otherwise returns the matching row left-joined to
-- courses so course fields may be NULL when the course was deleted.
-- Nothing else is exposed: no id, no lecturer, no students, no attendance.
-- ---------------------------------------------------------------------

drop function if exists public.verify_attendance_pdf(text);

create or replace function public.verify_attendance_pdf(
  p_code text
) returns table (
  course_code text,
  course_name text,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  v_code := upper(trim(coalesce(p_code, '')))::text;
  if v_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    return;
  end if;

  return query
  select
    c.course_code::text as course_code,
    c.course_name::text as course_name,
    ap.created_at       as created_at
  from public.attendance_pdfs ap
  left join public.courses c on c.id = ap.course_id
  where ap.pdf_code = v_code;
end;
$$;

revoke all on function public.verify_attendance_pdf(text) from public;
grant execute on function public.verify_attendance_pdf(text) to anon;
grant execute on function public.verify_attendance_pdf(text) to authenticated;

comment on table public.attendance_pdfs is
  'Verification codes for lecturer attendance-register PDFs. One row per issued code.';
comment on function public.record_attendance_pdf(uuid, text) is
  'Registers a PDF verification code for an owned course (lecturer only).';
comment on function public.verify_attendance_pdf(text) is
  'Publicly verifies a PDF code; returns course code/name/date or no rows.';

commit;
