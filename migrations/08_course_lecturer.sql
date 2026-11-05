-- Class-BARS Migration 08: courses belong to the lecturer who created them


alter table courses add column lecturer_id uuid references profiles(id);

comment on column courses.lecturer_id is
  'The lecturer who created and manages this course. NULL only for courses created before migration 08.';

create index if not exists idx_courses_lecturer on courses(lecturer_id);

-- Replace the staff-wide course policies with owner-scoped ones
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