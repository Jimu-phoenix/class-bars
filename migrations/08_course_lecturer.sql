-- =====================================================================
-- Class-BARS Migration 08: courses belong to the lecturer who created them
-- Applies on top of 07_real_table_grants.sql
--
-- 1. courses.lecturer_id: FK to profiles(id), matching class_sessions'
--    plain (NO ACTION) lecturer FK -- deleting a lecturer profile must
--    not silently cascade away their courses plus every session and
--    attendance record attached to them.
-- 2. course create/update policies now enforce ownership: a course is
--    inserted with lecturer_id = auth.uid() and can only be changed by
--    its owner (adms may manage any).
--
-- Existing courses keep lecturer_id NULL (the creator is unknowable at
-- this point); the app scopes its course lists to the signed-in
-- lecturer, so those legacy rows simply won't be manageable until
-- reassigned by an admin.
--
-- Re-runnable (idempotent).
-- =====================================================================

alter table courses add column lecturer_id uuid references profiles(id);

comment on column courses.lecturer_id is
  'The lecturer who created and manages this course. NULL only for courses created before migration 08.';

create index if not exists idx_courses_lecturer on courses(lecturer_id);

-- ---------------------------------------------------------------------
-- Replace the staff-wide course policies with owner-scoped ones
-- ---------------------------------------------------------------------
drop policy if exists "Staff create courses" on courses;
create policy "Staff create courses"
  on courses for insert
  with check (
    lecturer_id = auth.uid()
    and public.is_staff()
  );

drop policy if exists "Staff update courses" on courses;
create policy "Staff update courses"
  on courses for update
  using (
    public.is_staff()
    and (
      lecturer_id = auth.uid()
      or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    )
  )
  with check (
    public.is_staff()
    and (
      lecturer_id = auth.uid()
      or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    )
  );