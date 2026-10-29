-- Ensure admins can access other tables properly
-- Fix courses policy
DROP POLICY IF EXISTS "Admins manage courses" ON public.courses;
CREATE POLICY "Admins manage courses"
  ON public.courses FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- Fix venues policies  
DROP POLICY IF EXISTS "Admins manage venues" ON public.venues;
CREATE POLICY "Admins manage venues"
  ON public.venues FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- Fix enrollments for lecturers
DROP POLICY IF EXISTS "Lecturers and admins view course enrollments" ON public.enrollments;
CREATE POLICY "Lecturers view course enrollments"
  ON public.enrollments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.courses c 
      WHERE c.id = enrollments.course_id AND c.lecturer_id = auth.uid()
    )
    OR public.is_admin_user()
  );

-- Fix audit logs
DROP POLICY IF EXISTS "Admins view audit_logs" ON public.audit_logs;
CREATE POLICY "Admins view audit_logs"
  ON public.audit_logs FOR SELECT
  USING (public.is_admin_user());
