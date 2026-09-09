import { useCallback, useEffect, useState } from "react"
import { BookOpen, Loader2, UserPlus } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { enrollSelf } from "@/lib/realAttendance"
import { STUDENT_NAV } from "@/lib/nav"
import DashboardShell from "@/components/DashboardShell"
import StatCard from "@/components/dashboard/StatCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { CourseRow, EnrollmentRow } from "@/types/db"

type EnrolledCourseRow = EnrollmentRow & {
  courses: CourseRow | null
}

export default function StudentCourses() {
  const { user } = useAuth()
  const [courses, setCourses] = useState<CourseRow[]>([])
  const [myCourses, setMyCourses] = useState<EnrolledCourseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyCourseCode, setBusyCourseCode] = useState<string | null>(null)
  const [error, setError] = useState("")

  const loadCourses = useCallback(async () => {
    if (!user) return
    const [catRes, enrolledRes] = await Promise.all([
      supabase
        .from("courses")
        .select("id, course_code, course_name, department")
        .order("course_code", { ascending: true }),
      supabase
        .from("enrollments")
        .select(
          "id, student_id, course_id, academic_year, semester, courses(id, course_code, course_name, department)",
        )
        .eq("student_id", user.id),
    ])
    if (!catRes.error) setCourses((catRes.data as CourseRow[]) ?? [])
    if (!enrolledRes.error) {
      setMyCourses((enrolledRes.data as unknown as EnrolledCourseRow[]) ?? [])
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    const timer = window.setTimeout(() => {
      void loadCourses().then(() => setLoading(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [user, loadCourses])

  const enroll = async (courseCode: string) => {
    if (!user) return
    setBusyCourseCode(courseCode)
    setError("")
    try {
      await enrollSelf(courseCode)
      await loadCourses()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrollment failed")
    } finally {
      setBusyCourseCode(null)
    }
  }

  const enrolledCodes = new Set(myCourses.map((c) => c.course_id))
  const catalog = courses.filter((c) => !enrolledCodes.has(c.id))

  return (
    <DashboardShell
      roleLabel="Student dashboard"
      navItems={STUDENT_NAV}
      title="Courses"
      description="Your enrollments and the course catalog."
    >
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Enrolled"
          hint="Courses you can join"
          value={loading ? "—" : myCourses.length}
          icon={BookOpen}
          loading={loading}
        />
        <StatCard
          label="Available"
          hint="Open for enrollment"
          value={loading ? "—" : catalog.length}
          icon={UserPlus}
          loading={loading}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-4 text-muted-foreground" aria-hidden="true" />
              My courses
            </CardTitle>
            <CardDescription>Courses you&apos;re enrolled in.</CardDescription>
          </CardHeader>
          <CardContent>
            {myCourses.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm muted-text">
                You&apos;re not enrolled in any courses yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {myCourses.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {c.courses?.course_code} — {c.courses?.course_name}
                      </p>
                      <p className="text-xs muted-text">
                        {c.academic_year} · {c.semester}
                      </p>
                    </div>
                    {c.courses?.department && (
                      <Badge variant="outline" className="shrink-0">
                        {c.courses.department}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="size-4 text-muted-foreground" aria-hidden="true" />
              Enroll in a course
            </CardTitle>
            <CardDescription>
              Browse the catalog and enroll yourself. Live sessions for enrolled courses appear on
              your overview.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {catalog.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm muted-text">
                Nothing else to enroll in right now.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {catalog.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {c.course_code} — {c.course_name}
                      </p>
                      <p className="text-xs muted-text">{c.department ?? "—"}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyCourseCode === c.course_code}
                      onClick={() => void enroll(c.course_code)}
                    >
                      {busyCourseCode === c.course_code && (
                        <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
                      )}
                      Enroll
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  )
}