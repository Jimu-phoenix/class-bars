-- =====================================================================
-- Class-BARS: FULL PROJECT RESET (DESTRUCTIVE -- read every line!)
--
-- Wipes a Supabase project back to an empty baseline so it can be
-- rebuilt strictly from the files tracked in this repository.
--
-- !! DESTROYS PERMANENTLY, with no undo:
--   * every table / type / function / policy in schema `public`
--     (profiles, courses, venues, class_sessions, enrollments,
--      face_embeddings, devices, attendance_records, otp_codes,
--      audit_logs, sandbox_sessions, sandbox_checkins)
--   * every row of data in those tables
--   * ALL auth users (real accounts AND sandbox guests) plus their
--     sessions, refresh tokens and OAuth/phone identities
--   * all Storage buckets and their uploaded objects
--
-- NOT touched: project config kept outside the database -- Auth
-- providers (incl. captcha settings), SMTP, API keys, Edge Function
-- deployments, Realtime settings, backups.
--
-- BEFORE RUNNING:
--   1. This is meant for the DEV project. Never run against prod.
--   2. Back up if you might want anything back:
--        Dashboard -> Database -> Backups, or
--        pg_dump "$DATABASE_URL" > backup.sql
--
-- AFTER RUNNING (rebuild chain -- paste each file into SQL Editor,
-- in this exact order):
--   1. class_bars_schema_no_geo.sql        (base Phase-1 schema)
--   2. migrations/01_security_and_policies.sql
--   3. migrations/02_sandbox_module.sql
--   4. migrations/04_sandbox_profile_exclusion.sql
--      (installs the hardened handle_new_user signup trigger; on a
--       fresh build sections C/D simply find nothing to sweep)
--   5. migrations/05_sandbox_participants.sql
--   6. migrations/06_real_attendance_flow.sql
--   7. migrations/07_real_table_grants.sql
--      (explicit GRANTs on real tables -- required to avoid
--       "permission denied" once default privileges don't cover
--       pre-existing tables)
--   8. migrations/08_course_lecturer.sql
--      (courses.lecturer_id + owner-scoped course policies)
--   9. migrations/09_role_server_side.sql
--      (staff_email_domains allowlist + lecturer gated in handle_new_user
--       + profiles INSERT closed to role='student')
--   Do NOT run migrations/03_table_details.sql as part of the chain --
--   it is a read-only report, useful afterwards for verification.
--
-- Edge functions: this repo tracks NONE. Any functions on the old
-- project were authored elsewhere -> delete them in Dashboard ->
-- Edge Functions. If any are actually needed, they must be added to
-- the repo (ideally via `supabase init` + `supabase/functions`) so
-- drift like this cannot happen again.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Drop everything in `public` and restore Supabase default grants
--    (mirrors the grants a brand-new hosted project ships with)
-- ---------------------------------------------------------------------
drop schema public cascade;
create schema public;

grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Clear Storage buckets + objects
-- ---------------------------------------------------------------------
delete from storage.objects;
delete from storage.buckets;

-- ---------------------------------------------------------------------
-- 3. Clear Auth users (sessions / refresh tokens / identities /
--    MFA factors cascade away with them)
-- ---------------------------------------------------------------------
delete from auth.users;

-- ---------------------------------------------------------------------
-- 4. Verification (run after the whole script; expect all zeros/none)
-- ---------------------------------------------------------------------
select count(*) as public_tables_remaining
from pg_tables
where schemaname = 'public';

select count(*) as auth_users_remaining from auth.users;

select count(*) as signup_triggers_remaining
from pg_trigger t
join pg_class c     on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'auth'
  and c.relname = 'users'
  and not t.tgisinternal;

select count(*) as storage_buckets_remaining from storage.buckets;
