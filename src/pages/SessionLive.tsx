import { useCallback, useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  Ban,
  CalendarDays,
  CircleCheck,
  Clock,
  Fingerprint,
  Loader2,
  MapPin,
  Play,
  Square,
  UserRound,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { getSessionAttendance, type SessionAttendanceRow } from "@/lib/realAttendance"
import { usePoll } from "@/hooks/usePoll"
import DashboardShell from "@/components/DashboardShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { SessionStatus } from "@/types/db"

const POLL_MS = 3000

type SessionDetail = {
  id: string
  course_id: string
  lecturer_id: string
  venue_id: string
  scheduled_start: string
  scheduled_end: string
  actual_start: string | null
  actual_end: string | null
  status: SessionStatus
  venues: { name: string } | null
  courses: { course_code: string; course_name: string } | null
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  scheduled: "secondary",
  ongoing: "default",
  completed: "outline",
  cancelled: "destructive",
}

const methodLabel: Record<string, string> = {
  face: "Face",
  otp: "OTP",
  manual: "Manual",
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

function formatCheckinTime(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function SessionLive() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [session, setSession] = useState<SessionDetail | null>(null)
  const [loadError, setLoadError] = useState("")
  const [attendance, setAttendance] = useState<SessionAttendanceRow[]>([])
  const [actionError, setActionError] = useState("")
  const [busy, setBusy] = useState(false)

  const refetchSession = useCallback(async () => {
    if (!id) return
    const { data, error } = await supabase
      .from("class_sessions")
      .select(
        "id, course_id, lecturer_id, venue_id, scheduled_start, scheduled_end, actual_start, actual_end, status, venues(name), courses(course_code, course_name)",
      )
      .eq("id", id)
      .single()

    if (error) {
      setLoadError(error.message)
      return
    }
    setSession(data as unknown as SessionDetail)
    setLoadError("")
  }, [id])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!id) return
      const { data, error } = await supabase
        .from("class_sessions")
        .select(
          "id, course_id, lecturer_id, venue_id, scheduled_start, scheduled_end, actual_start, actual_end, status, venues(name), courses(course_code, course_name)",
        )
        .eq("id", id)
        .single()

      if (cancelled) return
      if (error) {
        setLoadError(error.message)
      } else {
        setSession(data as unknown as SessionDetail)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  const loadAttendance = useCallback(async () => {
    if (!id) return
    try {
      const rows = await getSessionAttendance(id)
      setAttendance(rows)
    } catch (err) {
      console.error("Failed to load attendance:", err)
    }
  }, [id])

  useEffect(() => {
    if (!session) return
    const timer = window.setTimeout(() => void loadAttendance(), 0)
    return () => window.clearTimeout(timer)
  }, [session, loadAttendance])

  usePoll(loadAttendance, session?.status === "ongoing" ? POLL_MS : null)

  const runAction = async (action: "start" | "end" | "cancel") => {
    if (!id) return
    if (action === "cancel" && !window.confirm("Cancel this session?")) return
    setActionError("")
    setBusy(true)
    try {
      if (action === "start") {
        const { error: rpcError } = await supabase.rpc("start_session", {
          p_session_id: id,
        })
        if (rpcError) throw rpcError
      } else if (action === "end") {
        const { error: rpcError } = await supabase.rpc("end_session", {
          p_session_id: id,
        })
        if (rpcError) throw rpcError
      } else {
        const { error: updateError } = await supabase
          .from("class_sessions")
          .update({ status: "cancelled" })
          .eq("id", id)
        if (updateError) throw updateError
      }
      await refetchSession()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setBusy(false)
    }
  }

  if (session === null) {
    return (
      <DashboardShell title="Session">
        <div className="flex items-center justify-center py-16">
          {loadError ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {loadError || "Session not found"}
            </p>
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          )}
        </div>
</DashboardShell>
    )
  }

  const presentCount = attendance.filter((a) => a.status !== "absent").length
  const classNameLabel =
    session.courses?.course_name ?? session.courses?.course_code ?? "—"

  return (
    <DashboardShell
      title={`${session.courses?.course_code} — ${classNameLabel}`}
      description={formatRange(session.scheduled_start, session.scheduled_end)}
    >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <span className="flex items-center gap-2">
                {session.venues?.name ? (
                  <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                ) : null}
                {session.venues?.name ?? "No venue"}
              </span>
              <Badge variant={statusVariant[session.status] ?? "outline"}>
                {session.status}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              {session.status === "scheduled" && (
                <>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void runAction("start")}
                  >
                    {busy ? (
                      <Loader2 data-icon="inline-start" className="animate-spin" />
                    ) : (
                      <Play data-icon="inline-start" aria-hidden="true" />
                    )}
                    Start session
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Cancel session"
                    disabled={busy}
                    onClick={() => void runAction("cancel")}
                  >
                    <Ban aria-hidden="true" />
                  </Button>
                </>
              )}
              {session.status === "ongoing" && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void runAction("end")}
                >
                  {busy ? (
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <Square data-icon="inline-start" aria-hidden="true" />
                  )}
                  End session
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => navigate("/dashboard")}>
                Back
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {actionError && (
            <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {actionError}
            </p>
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm muted-text">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {formatDateTime(session.scheduled_start)}
              {session.scheduled_end && (
                <> – {formatDateTime(session.scheduled_end)}</>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" aria-hidden="true" />
              {session.actual_start
                ? `Opened at ${formatDateTime(session.actual_start)}`
                : "Not opened yet"}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              Enrolled students check in via face
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attendance roster</CardTitle>
          <CardDescription>
            {presentCount} {presentCount === 1 ? "student has" : "students have"} checked in.
            Updates automatically while the session is live.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {attendance.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm muted-text">
              {session.status === "ongoing"
                ? "No check-ins yet. Students see this session on their live classes page."
                : "No attendance was recorded for this session."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {attendance.map((a) => (
                <li key={a.record_id} className="flex items-center justify-between gap-4 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                      <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.student_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.student_number ?? "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                      <Fingerprint className="size-3" aria-hidden="true" />
                      {methodLabel[a.method] ?? a.method}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={cn(
                        a.status === "present" && "text-green-700 dark:text-green-400",
                        a.status === "late" && "text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {a.status}
                    </Badge>
                    {a.confidence_score !== null && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {(a.confidence_score * 100).toFixed(0)}%
                      </span>
                    )}
                    <span className="w-36 text-right text-xs text-muted-foreground">
                      <span className="flex items-center justify-end gap-1">
                        <CircleCheck className="size-3.5" aria-hidden="true" />
                        {formatCheckinTime(a.check_in_time)}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </DashboardShell>
  )
}