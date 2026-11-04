import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { BookOpen, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import {
  getMyHistory,
  summariseHistory,
  studentResultLabel,
  formatDateTime,
} from "@/lib/history"
import { cn } from "@/lib/utils"
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
import type { CourseRow } from "@/types/db"

type EnrolledCourse = {
  course_id: string
  courses: CourseRow | null
}

export default function StudentHistory() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [courses, setCourses] = useState<EnrolledCourse[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<{
    session_id: string
    session_start: string
    session_status: string
    result: string | null
  }>>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState("")

  const loadCourses = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from("enrollments")
      .select("course_id, courses(course_code, course_name)")
      .eq("student_id", user.id)
      .order("created_at", { ascending: true })

    if (error) {
      setLoadError(error.message)
      return
    }
    const rows = (data as unknown as EnrolledCourse[] ?? []).filter(
      (c) => c.courses != null,
    )
    setCourses(rows)
    if (rows.length > 0 && !selectedCourseId) {
      setSelectedCourseId(rows[0].course_id)
    }
  }, [user, selectedCourseId])

  useEffect(() => {
    if (!user) return
    const timer = window.setTimeout(() => {
      void loadCourses()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [user, loadCourses])

  const loadHistory = useCallback(async () => {
    if (!user || !selectedCourseId) return
    setLoading(true)
    setLoadError("")
    try {
      const rows = await getMyHistory({ courseId: selectedCourseId })
      setHistory(
        rows.map((r) => ({
          session_id: r.session_id,
          session_start: r.session_start,
          session_status: r.session_status,
          result: r.result ?? null,
        })),
      )
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load history")
      setHistory([])
    } finally {
      setLoading(false)
    }
  }, [user, selectedCourseId])

  useEffect(() => {
    ;(async () => {
      await loadHistory()
    })()
  }, [selectedCourseId, loadHistory])

  const selectedCourse = courses.find((c) => c.course_id === selectedCourseId)
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

  const statusBadge = (code: string | null) => {
    switch (code) {
      case "pr":
        return "bg-emerald-400/10 text-emerald-900"
      case "prf":
        return "bg-amber-400/10 text-amber-900"
      case "ab":
        return "bg-destructive/10 text-destructive"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  if (courses.length === 0) {
    return (
      <DashboardShell title="History" description="Your attendance history by course.">
        <Card className="rounded-3xl bg-muted/60 p-5 sm:p-6">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <div className="size-12 rounded-2xl bg-muted flex items-center justify-center">
              <BookOpen className="size-6 text-muted-foreground" />
            </div>
            <CardTitle>No enrolled courses</CardTitle>
            <CardDescription>
              You are not enrolled in any courses yet. Browse the catalog and
              join a course to see your attendance history here.
            </CardDescription>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-4 rounded-full"
              onClick={() => void navigate("/student/courses")}
            >
              Go to Courses
            </Button>
          </CardContent>
        </Card>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell title="History" description="Your attendance history by course.">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <label htmlFor="history-course" className="text-sm font-medium">
            Course
          </label>
          <select
            id="history-course"
            value={selectedCourseId ?? ""}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="h-11 rounded-full border border-border bg-muted/40 px-4 text-sm"
            disabled={loading}
          >
            {courses.map((c) => (
              <option key={c.course_id} value={c.course_id}>
                {c.courses?.course_code} — {c.courses?.course_name}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {loadError && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {loadError}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Card className="rounded-3xl bg-muted/60 p-3 sm:p-4">
          <CardContent className="flex items-center gap-4 sm:gap-6">
            <span className="text-xs text-muted-foreground">
              Ended session{ended !== 1 ? "s" : ""}
            </span>
            <span className="text-sm font-semibold tabular-nums">{ended}</span>
            <span className="text-xs text-muted-foreground">Present</span>
            <span className="text-sm font-semibold tabular-nums text-emerald-900">
              {present}
            </span>
            <span className="text-xs text-muted-foreground">of {ended}</span>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-3xl bg-muted/60 p-5 sm:p-6">
        <CardHeader>
          <CardTitle>
            {selectedCourse?.courses?.course_code} —{" "}
            {selectedCourse?.courses?.course_name}
          </CardTitle>
          <CardDescription>Date, time and result for each session.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
              No sessions for this course yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/60 gap-2">
              {history.map((s) => {
                const label = studentResultLabel(s.result as
                  | "present"
                  | "late"
                  | "flagged"
                  | "absent"
                  | "upcoming"
                  | "live"
                  | null)
                const isUpcoming = s.session_status === "scheduled"
                const isLive = s.session_status === "ongoing"
                return (
                  <li key={s.session_id} className="rounded-2xl bg-background p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">
                          {new Date(s.session_start).toLocaleDateString(undefined, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                          {formatDateTime(s.session_start)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isUpcoming ? "Upcoming" : isLive ? "Live" : "Ended"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            statusBadge(s.result as
                              | "present"
                              | "late"
                              | "flagged"
                              | "absent"
                              | "upcoming"
                              | "live"
                              | null),
                          )}
                        >
                          {isUpcoming ? "Upcoming" : isLive ? "Live" : label ?? "—"}
                        </Badge>
                      </div>
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
