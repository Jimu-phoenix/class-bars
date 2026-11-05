-- Class-BARS Migration 11: admin section RLS

drop policy if exists "Authenticated users insert staff emails" on public.staff_emails;
create policy "Authenticated users insert staff emails"
  on public.staff_emails for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users delete staff emails" on public.staff_emails;
create policy "Authenticated users delete staff emails"
  on public.staff_emails for delete
  using (auth.role() = 'authenticated');

grant insert, delete on table public.staff_emails to authenticated;

drop policy if exists "Authenticated users update venues" on public.venues;
create policy "Authenticated users update venues"
  on public.venues for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users delete venues" on public.venues;
create policy "Authenticated users delete venues"
  on public.venues for delete
  using (auth.role() = 'authenticated');

grant update, delete on table public.venues to authenticated;

drop policy if exists "Authenticated users view audit logs" on public.audit_logs;
create policy "Authenticated users view audit logs"
  on public.audit_logs for select
  using (auth.role() = 'authenticated');

grant select on table public.audit_logs to authenticated;
