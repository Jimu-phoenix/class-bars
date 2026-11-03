import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { getLecturerSessions } from "@/lib/history"
import type { LecturerSessionRow } from "@/types/db"
import DashboardShell from "@/components/DashboardShell"
import SessionRow from "@/components/dashboard/SessionRow"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const PAGE_SIZE = 20

export default function LecturerSessions() {
  const { user } = useAuth()
  const [courses, setCourses] = useState<
    Array<{ id: string; course_code: string; course_name: string }>
  >([])
  const [courseFilter, setCourseFilter] = useState<string | null>(null)
  const [sessions, setSessions] = useState<LecturerSessionRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  const loadCourses = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from("courses")
      .select("id, course_code, course_name")
      .eq("lecturer_id", user.id)
      .order("course_code", { ascending: true })
    if (error) {
      setLoadError(error.message)
      return
    }
    setCourses((data as Array<{ id: string; course_code: string; course_name: string }>) ?? [])
  }, [user])

  useEffect(() => {
    if (!user) return
    const timer = window.setTimeout(() => {
      void loadCourses()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [user, loadCourses])

  // Fetch a single page of sessions. When `reset` is true it replaces the
  // list and resets the page; otherwise it appends at the current page.
  const fetchPage = useCallback(async (reset: boolean) => {
    if (!user) return
    const offset = reset ? 0 : page * PAGE_SIZE
    try {
      const rows = await getLecturerSessions({
        courseId: courseFilter ?? undefined,
        limit: PAGE_SIZE,
        offset,
      })
      if (reset) {
        setSessions(rows)
        setPage(0)
      } else {
        setSessions((prev) => [...prev, ...rows])
      }
      if (rows.length > 0) {
        setTotalCount(rows[0].total_count)
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load sessions")
    } finally {
      setLoading(false)
    }
  }, [user, courseFilter, page])

  // Reset to page 0 when the course filter changes.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError("")
      await fetchPage(true)
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [courseFilter, fetchPage])

  const handleLoadMore = () => {
    setPage((prev) => prev + 1)
  }

  // Load more when the user clicks "Load more" (page increments via handler).
  useEffect(() => {
    if (page === 0) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      await fetchPage(false)
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [page, fetchPage])

  const hasMore = sessions.length < totalCount && totalCount > 0

  const handleRetry = () => {
    setPage(0)
    void fetchPage(true)
  }

  return (
    <DashboardShell title="All sessions" description="Every session across your courses, newest first.">
      {loadError && !loading && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={handleRetry} className="shrink-0">
            Retry
          </Button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          Course
          <select
            value={courseFilter ?? ""}
            onChange={(e) => setCourseFilter(e.target.value || null)}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            disabled={loading}
          >
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.course_code} — {c.course_name}
              </option>
            ))}
          </select>
        </label>
        {loading && courses.length === 0 ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <div className="mt-4">
        {loading && sessions.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No sessions found{courseFilter ? " for this course" : ""}.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {sessions.map((s) => (
                <SessionRow
                  key={s.session_id}
                  id={s.session_id}
                  courseCode={s.course_code}
                  courseName={s.course_name}
                  venueName={s.venue_name ?? null}
                  scheduledStart={s.scheduled_start}
                  status={s.status as
                    | "scheduled"
                    | "ongoing"
                    | "completed"
                    | "cancelled"}
                />
              ))}
            </ul>
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <Button onClick={handleLoadMore} disabled={loading} className="h-10">
                  {loading ? (
                    <Loader2 className="mr-2 size-3.5 animate-spin" aria-hidden="true" />
                  ) : null}
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  )
}
