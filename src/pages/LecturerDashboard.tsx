import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  Ban,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Clock,
  Download,
  Loader2,
  MapPin,
  Play,
  Plus,
  Radio,
  Square,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { useLecturerSessions, type SessionListItem } from "@/hooks/useLecturerSessions"
import { getCourseAttendance } from "@/lib/realAttendance"
import { buildAttendanceCsv, downloadCsv, sanitizeFilename, toCsv } from "@/lib/csv"
import DashboardShell from "@/components/DashboardShell"
import StatCard from "@/components/dashboard/StatCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  scheduled: "secondary",
  ongoing: "default",
  completed: "outline",
  cancelled: "destructive",
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatRange(startIso: string, endIso: string) {
  const end = new Date(endIso)
  return `${formatDateTime(startIso)} – ${end.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

export default function LecturerDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState("")
  const [actionError, setActionError] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportCourseId, setExportCourseId] = useState("")
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState("")

  const { sessions, loading, error, refetch } = useLecturerSessions(user?.id)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const loadProfile = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single()
      if (!cancelled) {
        setFullName(profile?.full_name ?? user.user_metadata?.full_name ?? "")
      }
    }

    void loadProfile()
    return () => {
      cancelled = true
    }
  }, [user])

  const courses = useMemo(() => {
    const seen = new Map<string, { id: string; code: string; name: string }>()
    for (const s of sessions) {
      if (!s.courses?.course_code) continue
      seen.set(s.course_id, {
        id: s.course_id,
        code: s.courses.course_code,
        name: s.courses.course_name,
      })
    }
    return [...seen.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [sessions])

  const runCourseExport = async (e: FormEvent) => {
    e.preventDefault()
    if (!exportCourseId) {
      setExportError("Select a course to export.")
      return
    }
    setExportError("")
    setExporting(true)
    try {
      const rows = await getCourseAttendance(exportCourseId)
      const { headers, body } = buildAttendanceCsv(rows)
      const csv = toCsv(headers, body)
      const course = courses.find((c) => c.id === exportCourseId)
      const filename = sanitizeFilename(
        `attendance_${course?.code ?? "course"}_${new Date().toISOString().slice(0, 10)}.csv`
      )
      downloadCsv(filename, csv)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed")
    } finally {
      setExporting(false)
    }
  }

  const runSessionAction = async (
    session: SessionListItem,
    action: "start" | "end" | "cancel",
  ) => {
    if (action === "cancel" && !window.confirm("Cancel this session?")) return
    setActionError("")
    setBusyId(session.id)
    try {
      if (action === "start") {
        const { error: rpcError } = await supabase.rpc("start_session", {
          p_session_id: session.id,
        })
        if (rpcError) throw rpcError
      } else if (action === "end") {
        const { error: rpcError } = await supabase.rpc("end_session", {
          p_session_id: session.id,
        })
        if (rpcError) throw rpcError
      } else {
        const { error: updateError } = await supabase
          .from("class_sessions")
          .update({ status: "cancelled" })
          .eq("id", session.id)
        if (updateError) throw updateError
      }
      await refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setBusyId(null)
    }
  }

  const now = new Date().toISOString()
  const totalSessions = sessions.length
  const liveSessions = sessions.filter((s) => s.status === "ongoing").length
  const upcomingSessions = sessions.filter(
    (s) => s.status === "scheduled" && s.scheduled_start > now,
  ).length
  const totalCourses = new Set(sessions.map((s) => s.course_id)).size
  const recentSessions = sessions.slice(0, 5)

  return (
    <DashboardShell
      title="Dashboard"
      description="Here&apos;s an overview of your classes and sessions."
    >
      <div className="space-y-8">
        <div>
          <h1 className="heading-2">
            Welcome back{fullName ? `, ${fullName}` : ""}
          </h1>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total sessions"
            hint="All time"
            value={totalSessions}
            icon={CalendarDays}
            loading={loading}
          />
          <StatCard
            label="Live now"
            hint="Currently running"
            value={liveSessions}
            icon={Radio}
            loading={loading}
            accent="bg-emerald-500/10 text-emerald-600"
            pulse
          />
          <StatCard
            label="Upcoming"
            hint="Scheduled ahead of now"
            value={upcomingSessions}
            icon={Clock}
            loading={loading}
          />
          <StatCard
            label="Courses taught"
            hint="Distinct courses"
            value={totalCourses}
            icon={BookOpen}
            loading={loading}
          />
        </div>

        <Card className="hairline-border">
          <CardHeader>
            <CardTitle>Recent sessions</CardTitle>
            <CardDescription>Your latest class sessions, newest first.</CardDescription>
            <CardAction>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setExportOpen((o) => !o)}
                  aria-expanded={exportOpen}
                >
                  <Download data-icon="inline-start" aria-hidden="true" />
                  Export records
                  <ChevronDown data-icon="inline-end" aria-hidden="true" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/sessions/new")}>
                  <Plus data-icon="inline-start" aria-hidden="true" />
                  New session
                </Button>
              </div>
            </CardAction>
          </CardHeader>
          {exportOpen && (
            <form
              onSubmit={(e) => void runCourseExport(e)}
              className="mx-(--card-spacing) mb-2 rounded-lg border border-border bg-muted/40 p-4"
            >
              <label htmlFor="export-course" className="mb-2 block text-sm font-medium">
                Export attendance CSV for a course
              </label>
              <select
                id="export-course"
                value={exportCourseId}
                onChange={(e) => setExportCourseId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">Select a course…</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
              {exportError && (
                <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {exportError}
                </p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <Button type="submit" size="sm" disabled={exporting}>
                  {exporting && <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
                  {exporting ? "Exporting…" : "Export"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setExportOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
          <CardContent>
            {(error || actionError) && (
              <p className="mb-5 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {actionError || error}
              </p>
            )}
            {loading ? (
              <ul className="divide-y border-border">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="py-4">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                  </li>
                ))}
              </ul>
            ) : recentSessions.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm muted-text">
                No sessions yet. Create your first session to get started.
              </p>
            ) : (
              <ul className="divide-y border-border">
                {recentSessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        <Link
                          to={`/dashboard/sessions/${s.id}`}
                          className="transition-colors hover:text-primary hover:underline"
                        >
                          {s.courses?.course_code} — {s.courses?.course_name}
                        </Link>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs muted-text">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3.5" aria-hidden="true" />
                          {formatRange(s.scheduled_start, s.scheduled_end)}
                        </span>
                        {s.venues?.name && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5" aria-hidden="true" />
                            {s.venues.name}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {s.status === "scheduled" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === s.id}
                            onClick={() => void runSessionAction(s, "start")}
                          >
                            {busyId === s.id ? (
                              <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
                            ) : (
                              <Play data-icon="inline-start" aria-hidden="true" />
                            )}
                            Start
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Cancel session"
                            disabled={busyId === s.id}
                            onClick={() => void runSessionAction(s, "cancel")}
                          >
                            <Ban aria-hidden="true" />
                          </Button>
                        </>
                      )}
                      {s.status === "ongoing" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === s.id}
                          onClick={() => void runSessionAction(s, "end")}
                        >
                          {busyId === s.id ? (
                            <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
                          ) : (
                            <Square data-icon="inline-start" aria-hidden="true" />
                          )}
                          End
                        </Button>
                      )}
                      <Badge variant={statusVariant[s.status] ?? "outline"} className="gap-1.5">
                        {s.status === "ongoing" && (
                          <span className="relative flex size-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                          </span>
                        )}
                        {s.status}
                      </Badge>
                    </div>
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