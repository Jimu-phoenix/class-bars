-- Proper profiles RLS without recursion
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

-- SECURITY DEFINER functions to avoid recursion
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.is_lecturer_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role = 'lecturer' FROM public.profiles WHERE id = auth.uid()), false);
$$;

-- Users can view and update their own profile
CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK ((auth.uid() = id) AND (COALESCE(role, 'student'::user_role) = 'student'::user_role));

-- Admins can view and manage all profiles
CREATE POLICY "Admins view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin_user());

CREATE POLICY "Admins update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_admin_user());

CREATE POLICY "Admins insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (public.is_admin_user());

-- Lecturers can view profiles of students enrolled in their courses
CREATE POLICY "Lecturers view enrolled students"
  ON public.profiles FOR SELECT
  USING (
    public.is_lecturer_user() AND
    EXISTS (
      SELECT 1
      FROM public.enrollments e
      JOIN public.courses c ON c.id = e.course_id
      WHERE e.student_id = profiles.id
        AND c.lecturer_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_lecturer_user() TO authenticated;
