import { useCallback, useDeferredValue, useEffect, useState } from "react"
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
import {
  getSessionEnrolledStudents,
  lecturerMarkPresent,
  ManualMarkError,
  type EnrolledStudentRow,
} from "@/lib/manualMark"
import { filterStudents } from "@/lib/studentSearch"
import {
  displayMatchConfidence,
  MATCH_CONFIDENCE_TOOLTIP,
} from "@/lib/faceMatch"
import { usePoll } from "@/hooks/usePoll"
import DashboardShell from "@/components/DashboardShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { SessionStatus } from "@/types/db"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const POLL_MS = 3000

function formatFlagReason(reason: string): string {
  return reason
    .split(",")
    .map((part) => part.trim().replace(/_/g, " "))
    .filter(Boolean)
    .join(", ")
}

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

  // Manual mark state
  const [manualQuery, setManualQuery] = useState("")
  const [manualStudents, setManualStudents] = useState<EnrolledStudentRow[]>([])
  const [manualLoading, setManualLoading] = useState(false)
  const [manualError, setManualError] = useState("")
  const [manualSubmitting, setManualSubmitting] = useState<string | null>(null)
  const [manualDialogOpen, setManualDialogOpen] = useState(false)
  const [manualDialogStudent, setManualDialogStudent] = useState<EnrolledStudentRow | null>(null)
  const [manualNotice, setManualNotice] = useState("")

  const debouncedQuery = useDeferredValue(manualQuery)

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

  // Load enrolled students once when the session is ongoing and the card is visible.
  useEffect(() => {
    if (!id || session?.status !== "ongoing") return
    let cancelled = false
    const load = async () => {
      setManualLoading(true)
      setManualError("")
      try {
        const rows = await getSessionEnrolledStudents(id)
        if (!cancelled) setManualStudents(rows)
      } catch (err) {
        if (!cancelled) {
          setManualError(err instanceof Error ? err.message : "Failed to load enrolled students")
        }
      } finally {
        if (!cancelled) setManualLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id, session?.status])

  const handleManualQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setManualQuery(e.target.value)
    setManualError("")
    setManualNotice("")
  }

  const handleMarkClick = (student: EnrolledStudentRow) => {
    setManualError("")
    setManualDialogStudent(student)
    setManualDialogOpen(true)
  }

  const handleConfirmMark = async () => {
    if (!manualDialogStudent || !id) return
    setManualError("")
    setManualSubmitting(manualDialogStudent.student_id)
    try {
      await lecturerMarkPresent(id, manualDialogStudent.student_id)
      setManualNotice(`${manualDialogStudent.full_name} marked present`)
      setManualQuery("")
      setManualDialogOpen(false)
      setManualDialogStudent(null)
      // Optimistically update the enrolled list; roster refreshes via existing poll.
      setManualStudents((prev) =>
        prev.map((s) =>
          s.student_id === manualDialogStudent!.student_id
            ? { ...s, checked_in: true }
            : s,
        ),
      )
      void loadAttendance()
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      if (e instanceof ManualMarkError && e.code === "already_recorded") {
        setManualNotice(`${manualDialogStudent.full_name} is already checked in`)
      } else {
        setManualError(e.message)
      }
    } finally {
      setManualSubmitting(null)
    }
  }

  const filteredStudents = filterStudents(manualStudents, debouncedQuery)

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
              {attendance.map((a) => {
                const matchConfidence = displayMatchConfidence(a.match_score)
                return (
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
                        {a.status === "flagged" && a.flag_reason && (
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                            {formatFlagReason(a.flag_reason)}
                          </p>
                        )}
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
                          a.status === "flagged" && "text-amber-700 dark:text-amber-400",
                        )}
                      >
                        {a.status}
                      </Badge>
                      {matchConfidence !== null && (
                        <span
                          className="whitespace-nowrap text-xs text-muted-foreground"
                          title={MATCH_CONFIDENCE_TOOLTIP}
                        >
                          Match confidence: {matchConfidence}%
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
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {session.status === "ongoing" && (
        <Card>
          <CardHeader>
            <CardTitle>Mark attendance manually</CardTitle>
            <CardDescription>
              For a student who cannot use their own device. Mark them present only
              after you have seen them in the room. Recorded as a manual mark in
              your name.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {manualError && (
              <p role="alert" className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {manualError}
              </p>
            )}
            {manualNotice && (
              <p role="status" className="mb-3 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-300">
                {manualNotice}
              </p>
            )}
            <div className="mb-4">
              <label htmlFor="manual-search" className="text-sm font-medium block mb-1.5">
                Search enrolled students by name or registration number
              </label>
              <Input
                id="manual-search"
                type="search"
                autoComplete="off"
                placeholder="Type a name or reg number…"
                value={manualQuery}
                onChange={handleManualQueryChange}
                disabled={manualLoading}
                className="h-10 w-full"
              />
              {debouncedQuery.length > 0 && debouncedQuery.length < 2 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Type at least 2 characters to search.
                </p>
              )}
              {debouncedQuery.length >= 2 && filteredStudents.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  No enrolled student matches that search.
                </p>
              )}
            </div>

            {manualLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredStudents.map((s) => (
                  <li key={s.student_id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.registration_number ?? "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.checked_in ? (
                        <Badge variant="secondary" className="h-8 px-2.5 text-xs">
                          Checked in
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => void handleMarkClick(s)}
                          disabled={manualSubmitting === s.student_id}
                          className="h-8 px-3 text-xs"
                        >
                          {manualSubmitting === s.student_id ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <span>Mark</span>
                          )}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
                {filteredStudents.length === 0 && debouncedQuery.length >= 2 && manualStudents.length > 0 && (
                  <li className="py-4 text-center text-xs text-muted-foreground">
                    No enrolled student matches that search.
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirm dialog for manual mark */}
      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark student present?</DialogTitle>
            <DialogDescription>
              Mark{" "}
              {manualDialogStudent?.full_name}{" "}
              ({manualDialogStudent?.registration_number ?? "—"}) as present for
              this session? Only do this for students you have seen in the room.
              This is recorded as a manual mark in your name.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setManualDialogOpen(false)
                setManualDialogStudent(null)
              }}
              disabled={manualSubmitting !== null}
              className="h-10"
              autoFocus
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmMark}
              disabled={manualSubmitting !== null || !manualDialogStudent}
              className="h-10"
            >
              {manualSubmitting !== null ? (
                <Loader2 className="mr-2 size-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              Mark present
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}