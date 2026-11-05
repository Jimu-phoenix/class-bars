-- Class-BARS Migration 27: admin policies for courses/venues/enrollments/audit_logs
DROP POLICY IF EXISTS "Admins manage courses" ON public.courses;
CREATE POLICY "Admins manage courses"
  ON public.courses FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY "Admins manage venues"
  ON public.venues FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

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

CREATE POLICY "Admins view audit_logs"
  ON public.audit_logs FOR SELECT
  USING (public.is_admin_user());
