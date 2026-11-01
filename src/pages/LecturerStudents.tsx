import { useEffect, useState } from "react"
import { BookOpen, Loader2, Users } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import DashboardShell from "@/components/DashboardShell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

type CourseGroup = {
  course_id: string
  course_code: string
  course_name: string
  students: Array<{
    enrollment_id: string
    student_id: string
    student_name: string
    student_number: string | null
  }>
}

export default function LecturerStudents() {
  const { user } = useAuth()
  const [groups, setGroups] = useState<CourseGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const load = async () => {
      if (!user) return
      setLoading(true)
      setError("")
      try {
        // Get courses taught by this lecturer
        const { data: courses, error: coursesError } = await supabase
          .from("courses")
          .select("id, course_code, course_name")
          .eq("lecturer_id", user.id)
          .order("course_code", { ascending: true })

        if (coursesError) throw coursesError
        if (!courses || courses.length === 0) {
          setGroups([])
          setLoading(false)
          return
        }

        const courseIds = courses.map((c) => c.id)

        const { data: enrollments, error: enrollmentsError } = await supabase
          .from("enrollments")
          .select("id, course_id, student_id")
          .in("course_id", courseIds)

        if (enrollmentsError) throw enrollmentsError
        if (!enrollments || enrollments.length === 0) {
          setGroups(
            courses.map((c) => ({
              course_id: c.id,
              course_code: c.course_code,
              course_name: c.course_name,
              students: [],
            })),
          )
          setLoading(false)
          return
        }

        const studentIds = [...new Set(enrollments.map((e) => e.student_id))]
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, student_number")
          .in("id", studentIds)

        if (profilesError) throw profilesError
        const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

        const groupsMap = new Map<string, CourseGroup>()
        for (const course of courses) {
          groupsMap.set(course.id, {
            course_id: course.id,
            course_code: course.course_code,
            course_name: course.course_name,
            students: [],
          })
        }

        for (const e of enrollments) {
          const group = groupsMap.get(e.course_id)
          if (!group) continue
          const profile = profileMap.get(e.student_id)
          group.students.push({
            enrollment_id: e.id,
            student_id: e.student_id,
            student_name: profile?.full_name ?? "Unknown",
            student_number: profile?.student_number ?? null,
          })
        }

        for (const group of groupsMap.values()) {
          group.students.sort((a, b) => a.student_name.localeCompare(b.student_name))
        }

        setGroups(Array.from(groupsMap.values()))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load roster")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [user])

  const totalStudents = groups.reduce((sum, g) => sum + g.students.length, 0)

  return (
    <DashboardShell title="Students" description="Enrolled students grouped by course">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {totalStudents} student{totalStudents === 1 ? "" : "s"} across {groups.length} course{groups.length === 1 ? "" : "s"}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <BookOpen className="size-6 text-muted-foreground" />
            <p className="font-medium">No courses found</p>
            <p className="text-sm text-muted-foreground">
              Create a course to see enrolled students here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={group.course_id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    <span>{group.course_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{group.course_code}</Badge>
                    <Badge variant="secondary">
                      {group.students.length} student{group.students.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                </CardTitle>
                <CardDescription>Enrolled students</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {group.students.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic py-4">
                    No students enrolled in this course yet
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="pb-2 pr-4">#</th>
                          <th className="pb-2 pr-4">Student Name</th>
                          <th className="pb-2">Registration No.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.students.map((student, idx) => (
                          <tr key={student.enrollment_id} className="border-b border-border last:border-0">
                            <td className="py-2.5 pr-4 text-muted-foreground">{idx + 1}</td>
                            <td className="py-2.5 pr-4 font-medium">{student.student_name}</td>
                            <td className="py-2.5 text-muted-foreground">{student.student_number ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  )
}
