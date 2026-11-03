import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, CalendarDays, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import {
  getStudentHeaderForLecturer,
  getStudentHistoryForLecturer,
  lecturerStatusCode,
  summariseHistory,
  studentResultLabel,
  methodLabel,
  formatDateTime,
} from "@/lib/history"
import DashboardShell from "@/components/DashboardShell"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

type SharedCourse = {
  course_id: string
  course_code: string
  course_name: string
}

type HistoryRow = {
  session_id: string
  course_id: string
  course_code: string
  course_name: string
  session_start: string
  session_status: string
  result: string | null
  method: string | null
}

export default function LecturerStudentDetail() {
  const { user } = useAuth()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [student, setStudent] = useState<{
    student_id: string
    full_name: string
    registration_number: string | null
  } | null>(null)
  const [sharedCourses, setSharedCourses] = useState<SharedCourse[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notFound, setNotFound] = useState(false)

  const loadHistory = useCallback(
    async (courseId: string) => {
      try {
        const rows = await getStudentHistoryForLecturer({
          studentId: id!,
          courseId,
        })
        setHistory(
          rows.map((r) => ({
            session_id: r.session_id,
            course_id: r.course_id,
            course_code: r.course_code,
            course_name: r.course_name,
            session_start: r.session_start,
            session_status: r.session_status,
            result: r.result ?? null,
            method: r.method ?? null,
          })),
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load history")
      }
    },
    [id],
  )

  const loadData = useCallback(async () => {
    if (!user || !id) return
    setLoading(true)
    setError("")
    setNotFound(false)
    try {
      const header = await getStudentHeaderForLecturer({ studentId: id })
      if (!header) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setStudent(header)

      const { data: enrolData, error: enrolError } = await supabase
        .from("enrollments")
        .select("course_id, courses(course_code, course_name, lecturer_id)")
        .eq("student_id", id)

      if (enrolError) throw enrolError
      const raw = (enrolData as unknown as Array<{
        course_id: string
        courses: {
          course_code: string
          course_name: string
          lecturer_id: string
        } | null
      }>) ?? []
      const courses = raw
        .filter((e) => e.courses?.lecturer_id === user.id)
        .map((e) => ({
          course_id: e.course_id,
          course_code: e.courses!.course_code,
          course_name: e.courses!.course_name,
        }))
      setSharedCourses(courses)

      const courseId = courses.length > 0 ? courses[0].course_id : null
      setSelectedCourseId(courseId)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load student"
      if (/Student not found in your courses/i.test(message)) {
        setNotFound(true)
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }, [user, id])

  useEffect(() => {
    ;(async () => {
      await loadData()
    })()
  }, [loadData])

  useEffect(() => {
    ;(async () => {
      if (selectedCourseId) {
        await loadHistory(selectedCourseId)
      }
    })()
  }, [selectedCourseId, loadHistory])

  if (loading) {
    return (
      <DashboardShell title="Student" description="Attendance history.">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-8 animate-spin text-primary" aria-label="Loading" />
        </div>
      </DashboardShell>
    )
  }

  if (notFound) {
    return (
      <DashboardShell title="Student" description="Attendance history.">
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm font-medium text-destructive">
              Student not found in your courses
            </p>
            <CardDescription>
              This student is not enrolled in any of your courses, so their
              history is not available to you.
            </CardDescription>
            <Button onClick={() => navigate("/dashboard/students")} className="h-10">
              Back to students
            </Button>
          </CardContent>
        </Card>
      </DashboardShell>
    )
  }

  if (!student || error) {
    return (
      <DashboardShell title="Student" description="Attendance history.">
        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}
      </DashboardShell>
    )
  }

  const { present, ended } = summariseHistory(
    history.map((r) => ({
      session_id: r.session_id,
      session_start: r.session_start,
      session_status: r.session_status as
        | "scheduled"
        | "ongoing"
        | "completed"
        | "cancelled",
      result: r.result as
        | "present"
        | "late"
        | "flagged"
        | "absent"
        | "upcoming"
        | "live"
        | null,
    })),
  )

  const showCourseFilter = sharedCourses.length > 1

  return (
    <DashboardShell title="Student" description="Attendance history.">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2"
          onClick={() => navigate("/dashboard/students")}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">{student.full_name}</h1>
          <Badge variant="outline">{student.registration_number ?? "—"}</Badge>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <Badge variant="secondary">
          {ended} ended session{ended !== 1 ? "s" : ""}
        </Badge>
        <Badge
          variant="default"
          className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        >
          Present {present} of {ended}
        </Badge>
        {showCourseFilter && (
          <select
            value={selectedCourseId ?? ""}
            onChange={(e) => setSelectedCourseId(e.target.value || null)}
            className="h-9 rounded-md border border-input bg-background px-3 py-2 text-sm ml-4"
          >
            {sharedCourses.map((c) => (
              <option key={c.course_id} value={c.course_id}>
                {c.course_code} — {c.course_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>
            pr present · prf present (flagged) · ab absent. Late counts as pr.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              No sessions for this course.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {history.map((s) => {
                const code = lecturerStatusCode(
                  s.result as
                    | "present"
                    | "late"
                    | "flagged"
                    | "absent"
                    | "upcoming"
                    | "live"
                    | null,
                )
                const label = studentResultLabel(
                  s.result as
                    | "present"
                    | "late"
                    | "flagged"
                    | "absent"
                    | "upcoming"
                    | "live"
                    | null,
                )
                const isUpcoming = s.session_status === "scheduled"
                const isLive = s.session_status === "ongoing"
                const hasRecord = s.result !== null && s.method !== null
                return (
                  <li key={s.session_id} className="flex items-center justify-between gap-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">
                        {s.course_code} — {s.course_name}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="size-3" aria-hidden="true" />
                        {formatDateTime(s.session_start)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant={code === null ? "outline" : "secondary"}
                        className={cn(
                          code === "pr" && "text-green-700 dark:text-green-400",
                          code === "prf" && "text-amber-700 dark:text-amber-400",
                          code === "ab" && "text-muted-foreground dark:text-muted-foreground",
                        )}
                      >
                        {isUpcoming ? "Upcoming" : isLive ? "Live" : label ?? code ?? "—"}
                      </Badge>
                      {hasRecord && s.method && (
                        <Badge variant="ghost" className="text-xs">
                          {methodLabel(s.method as "face" | "otp" | "manual")}
                        </Badge>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  )
}
