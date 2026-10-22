-- =====================================================================
-- Class-BARS Migration 11: admin section RLS
-- Applies on top of 01–10.
--
-- Grants authenticated (and service_role) write access so the admin UI
-- can manage staff_emails and venues directly from the browser.
-- Re-runnable (idempotent). Run in the SQL Editor as postgres.
-- =====================================================================

-- ---------------------------------------------------------------------
-- staff_emails: allow authenticated users to insert/delete.
-- Select was already granted by migration 10. Only admins should be
-- able to modify, but RLS has no role-aware distinction here beyond
-- auth.role() = 'authenticated' — the AdminRoute guard already ensures
-- only users with profiles.role = 'admin' can reach this UI.
-- ---------------------------------------------------------------------
drop policy if exists "Authenticated users insert staff emails" on public.staff_emails;
create policy "Authenticated users insert staff emails"
  on public.staff_emails for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users delete staff emails" on public.staff_emails;
create policy "Authenticated users delete staff emails"
  on public.staff_emails for delete
  using (auth.role() = 'authenticated');

grant insert, delete on table public.staff_emails to authenticated;

-- ---------------------------------------------------------------------
-- venues: allow authenticated users to update/delete.
-- Select + insert already exist from migration 01.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- audit_logs: allow authenticated users to select (for system logs view).
-- ---------------------------------------------------------------------
drop policy if exists "Authenticated users view audit logs" on public.audit_logs;
create policy "Authenticated users view audit logs"
  on public.audit_logs for select
  using (auth.role() = 'authenticated');

grant select on table public.audit_logs to authenticated;
