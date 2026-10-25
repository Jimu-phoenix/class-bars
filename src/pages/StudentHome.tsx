import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  CalendarClock,
  CircleCheck,
  Clock,
  Loader2,
  LocateFixed,
  Presentation,
  RefreshCw,
  ScanFace,
  UserRound,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import {
  checkInFace,
  getActiveFaceEmbedding,
  parseEmbedding,
} from "@/lib/realAttendance"
import { euclideanDistance } from "@/lib/faceCompare"
import {
  FLAGGED_CHECKIN_MESSAGE,
  GOOD_ACCURACY_M,
  MAX_ACCURACY_M,
  checkInBlockMessage,
  geolocationErrorMessage,
  getCurrentPosition,
  type Coordinates,
} from "@/lib/geofence"
import { fullScreenOnMobile } from "@/lib/dialogClasses"
import { usePoll } from "@/hooks/usePoll"
import DashboardShell from "@/components/DashboardShell"
import StatCard from "@/components/dashboard/StatCard"
import FaceVerifyCard, { type VerifyVerdict } from "@/components/face/FaceVerifyCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { AttendanceRecordRow, SessionStatus } from "@/types/db"

const POLL_MS = 3000

type LiveSessionListItem = {
  id: string
  course_id: string
  scheduled_start: string
  scheduled_end: string
  status: SessionStatus
  venues: { name: string } | null
  courses: { course_code: string; course_name: string } | null
}

type Stage = "select" | "verifying" | "confirmed"

type EmbeddingState =
  | { status: "loading" }
  | { status: "ok" }
  | { status: "missing" }
  | { status: "stale" }

function formatStartedAt(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function accuracyLabel(accuracy: number) {
  if (accuracy <= GOOD_ACCURACY_M) {
    return { label: "Good", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" }
  }
  if (accuracy <= MAX_ACCURACY_M) {
    return { label: "Fair", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" }
  }
  return { label: "Poor", className: "bg-destructive/10 text-destructive" }
}

export default function StudentHome() {
  const { user, loading: authLoading } = useAuth()

  const [fullName, setFullName] = useState("")
  const [liveSessions, setLiveSessions] = useState<LiveSessionListItem[]>([])
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [checkedInBySession, setCheckedInBySession] = useState<
    Record<string, AttendanceRecordRow>
  >({})
  const [embedding, setEmbedding] = useState<EmbeddingState>({ status: "loading" })
  const [statsLoading, setStatsLoading] = useState(true)
  const [checkedToday, setCheckedToday] = useState(0)
  const [totalCheckins, setTotalCheckins] = useState(0)

  const [stage, setStage] = useState<Stage>("select")
  const [selectedSession, setSelectedSession] = useState<LiveSessionListItem | null>(null)
  const [storedDescriptor, setStoredDescriptor] = useState<Float32Array | null>(null)
  const [confirmedCheckin, setConfirmedCheckin] = useState<AttendanceRecordRow | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [verifyResult, setVerifyResult] = useState<VerifyVerdict>(null)
  const [location, setLocation] = useState<Coordinates | null>(null)
  const [locationLoading, setLocationLoading] = useState(true)
  const [locationError, setLocationError] = useState("")

  const loadLocation = useCallback(async () => {
    setLocationLoading(true)
    setLocationError("")
    try {
      setLocation(await getCurrentPosition())
    } catch (err) {
      setLocationError(
        geolocationErrorMessage(err) ??
          (err instanceof Error ? err.message : "Could not get your location"),
      )
    } finally {
      setLocationLoading(false)
    }
  }, [])

  const loadEmbedding = useCallback(async () => {
    if (!user) return
    try {
      const row = await getActiveFaceEmbedding(user.id)
      if (!row) {
        setEmbedding({ status: "missing" })
        return
      }
      const stored = parseEmbedding(row.embedding_json)
      if (!stored) {
        setEmbedding({ status: "stale" })
        return
      }
      setEmbedding({ status: "ok" })
    } catch {
      setEmbedding({ status: "missing" })
    }
  }, [user])

  const loadStats = useCallback(async () => {
    if (!user) return
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [{ count: todayCount }, { count: totalCount }] = await Promise.all([
      supabase
        .from("attendance_records")
        .select("id", { count: "exact", head: true })
        .eq("student_id", user.id)
        .gte("check_in_time", today.toISOString()),
      supabase
        .from("attendance_records")
        .select("id", { count: "exact", head: true })
        .eq("student_id", user.id),
    ])

    setCheckedToday(todayCount ?? 0)
    setTotalCheckins(totalCount ?? 0)
    setStatsLoading(false)
  }, [user])

  const loadProfile = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single()
    setFullName(data?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? "")
  }, [user])

  useEffect(() => {
    if (!user) return
    const timer = window.setTimeout(() => {
      void loadEmbedding()
      void loadStats()
      void loadProfile()
      void loadLocation()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [user, loadEmbedding, loadStats, loadProfile, loadLocation])

  const refresh = useCallback(async () => {
    if (!user) return
    const { data: sessionsData, error: sessionsError } = await supabase
      .from("class_sessions")
      .select(
        "id, course_id, scheduled_start, scheduled_end, status, venues(name), courses(course_code, course_name)",
      )
      .eq("status", "ongoing")
      .order("scheduled_start", { ascending: true })

    if (sessionsError) {
      setSessionsLoaded(true)
      return
    }
    const sessionRows = (sessionsData as unknown as LiveSessionListItem[]) ?? []
    setLiveSessions(sessionRows)
    setSessionsLoaded(true)

    if (sessionRows.length === 0) {
      setCheckedInBySession({})
      return
    }

    const { data: checkinsData, error: checkinsError } = await supabase
      .from("attendance_records")
      .select("*")
      .in(
        "session_id",
        sessionRows.map((s) => s.id),
      )
      .eq("student_id", user.id)

    if (checkinsError) return
    const map: Record<string, AttendanceRecordRow> = {}
    for (const c of (checkinsData as AttendanceRecordRow[] | null) ?? []) {
      map[c.session_id] = c
    }
    setCheckedInBySession(map)
  }, [user])

  usePoll(refresh, user ? POLL_MS : null)

  const joinSession = async (session: LiveSessionListItem) => {
    if (!user) return
    setError("")
    setVerifyResult(null)
    try {
      const row = await getActiveFaceEmbedding(user.id)
      if (!row) {
        setError("You have no face template yet. Enroll your face from your profile first.")
        return
      }
      const stored = parseEmbedding(row.embedding_json)
      if (!stored) {
        setError("Your face template is out of date. Re-enroll it from your profile.")
        return
      }
      setStoredDescriptor(stored)
      setSelectedSession(session)
      setStage("verifying")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your face template")
    }
  }

  const cancelVerify = () => {
    setError("")
    setVerifyResult(null)
    setStoredDescriptor(null)
    setSelectedSession(null)
    setStage("select")
  }

  const checkIn = async (descriptor: Float32Array) => {
    if (!user || !selectedSession || !storedDescriptor) return
    if (!liveSessions.some((s) => s.id === selectedSession.id)) {
      setSelectedSession(null)
      setStoredDescriptor(null)
      setVerifyResult(null)
      setStage("select")
      setError("That class is no longer live.")
      return
    }
    setSubmitting(true)
    setError("")
    try {
      const location = await getCurrentPosition()
      setLocation(location)
      setLocationError("")
      const distance = euclideanDistance(storedDescriptor, descriptor)
      const row = await checkInFace(
        selectedSession.id,
        user.id,
        distance,
        location,
      )
      setCheckedInBySession((m) => ({ ...m, [selectedSession.id]: row }))
      setCheckedToday((n) => n + 1)
      setTotalCheckins((n) => n + 1)
      setConfirmedCheckin(row)
      setStage("confirmed")
    } catch (err) {
      const message =
        geolocationErrorMessage(err) ??
        checkInBlockMessage(err) ??
        (err instanceof Error ? err.message : "Check-in failed")
      if (/already recorded/i.test(message)) {
        const { data } = await supabase
          .from("attendance_records")
          .select("*")
          .eq("session_id", selectedSession.id)
          .eq("student_id", user.id)
          .maybeSingle()
        if (data) {
          setCheckedInBySession((m) => ({
            ...m,
            [selectedSession.id]: data as AttendanceRecordRow,
          }))
          setConfirmedCheckin(data as AttendanceRecordRow)
          setStage("confirmed")
        } else {
          setError(message)
        }
      } else {
        setError(message)
        setVerifyResult(null)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const doneConfirming = () => {
    setConfirmedCheckin(null)
    setVerifyResult(null)
    setStoredDescriptor(null)
    setSelectedSession(null)
    setStage("select")
    void loadStats()
  }

  if (authLoading || !user) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-8 animate-spin text-primary" aria-label="Loading" />
        </div>
      </DashboardShell>
    )
  }

  const confirmedClassName = confirmedCheckin
    ? liveSessions.find((s) => s.id === confirmedCheckin.session_id)?.courses?.course_name
    : undefined
  const confirmedFlagged = confirmedCheckin?.status === "flagged"

  const selectedName =
    selectedSession?.courses?.course_name ?? selectedSession?.courses?.course_code ?? "class"

  const faceStat =
    embedding.status === "ok"
      ? { value: "Ready", accent: "bg-emerald-500/10 text-emerald-600" }
      : embedding.status === "missing"
        ? { value: "Not set", accent: "bg-destructive/10 text-destructive" }
        : { value: "Update", accent: "bg-amber-500/10 text-amber-600" }

  const firstName = fullName.trim().split(" ")[0]
  const locationAccuracy = location ? accuracyLabel(location.accuracy) : null

  return (
    <DashboardShell
      title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
      description="Here's what's live right now."
    >
      {error && stage !== "verifying" && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {(embedding.status === "missing" || embedding.status === "stale") && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 sm:p-4">
          <UserRound className="size-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {embedding.status === "missing"
                ? "Enroll your face to check in"
                : "Your face template is out of date"}
            </p>
            <p className="text-xs text-muted-foreground">
              {embedding.status === "missing"
                ? "Add it once from your profile."
                : "Re-enroll it from your profile."}
            </p>
          </div>
          <Link to="/student/profile" className="shrink-0">
            <Button size="sm" variant="outline">
              Fix
            </Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatCard
          label="Today"
          hint="Check-ins since midnight"
          value={checkedToday}
          icon={Clock}
          loading={statsLoading}
        />
        <StatCard
          label="Total"
          hint="All-time check-ins"
          value={totalCheckins}
          icon={CalendarClock}
          loading={statsLoading}
        />
        <StatCard
          label="Face"
          hint="Template status"
          value={faceStat.value}
          icon={ScanFace}
          loading={embedding.status === "loading"}
          accent={faceStat.accent}
        />
      </div>

      <section
        aria-labelledby="location-heading"
        className="rounded-xl border border-border bg-card p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <LocateFixed className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="location-heading" className="text-sm font-semibold">
                Your location
              </h2>
              <p className="text-xs text-muted-foreground">
                Coordinates stay on this device — check-in stores only distance and accuracy.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => void loadLocation()}
            disabled={locationLoading}
          >
            <RefreshCw
              className={cn("size-3.5", locationLoading && "animate-spin")}
              aria-hidden="true"
            />
            {location ? "Refresh" : "Locate"}
          </Button>
        </div>

        {locationLoading && !location ? (
          <div className="mt-3 h-6 w-52 animate-pulse rounded-full bg-muted" aria-hidden="true" />
        ) : locationError ? (
          <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {locationError}
          </p>
        ) : location && locationAccuracy ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 font-medium",
                locationAccuracy.className,
              )}
            >
              {locationAccuracy.label}
            </span>
            <span>±{Math.round(location.accuracy)} m accuracy</span>
            {location.accuracy > MAX_ACCURACY_M && (
              <span className="text-destructive">
                Too poor to check in.
              </span>
            )}
          </div>
        ) : null}
      </section>

      {stage === "confirmed" && confirmedCheckin ? (
        <div
          role="status"
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border px-4 py-10 text-center",
            confirmedFlagged
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-green-500/30 bg-green-500/5",
          )}
        >
          <CircleCheck
            className={cn("size-10", confirmedFlagged ? "text-amber-600" : "text-green-600")}
            aria-hidden="true"
          />
          <p className="text-xl font-semibold">
            {confirmedFlagged ? "Checked in — flagged for review" : "You're checked in"}
          </p>
          <p className="text-sm text-muted-foreground">
            {confirmedClassName ?? "Your class"} — you now appear on the lecturer&apos;s live list.
          </p>
          {confirmedFlagged && (
            <p className="max-w-sm text-sm font-medium text-amber-700 dark:text-amber-400">
              {FLAGGED_CHECKIN_MESSAGE}
            </p>
          )}
          <Button onClick={doneConfirming} className="mt-2 h-11 w-full sm:w-auto">
            Back to classes
          </Button>
        </div>
      ) : (
        <section aria-labelledby="live-heading" className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 id="live-heading" className="text-base font-semibold">
              Live classes
            </h2>
            {sessionsLoaded && liveSessions.length > 0 && (
              <Badge variant="secondary" className="tabular-nums">
                {liveSessions.length}
              </Badge>
            )}
          </div>

          {!sessionsLoaded ? (
            <div className="space-y-3" aria-hidden="true">
              <div className="h-32 animate-pulse rounded-xl bg-muted" />
              <div className="h-32 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : liveSessions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-12 text-center">
              <Presentation className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">No class is live right now</p>
              <p className="text-sm text-muted-foreground">
                This page updates automatically when a lecturer starts one.
              </p>
            </div>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {liveSessions.map((s) => {
                const done = checkedInBySession[s.id]
                const meta = [s.courses?.course_code, s.venues?.name].filter(Boolean).join(" · ")
                return (
                  <li
                    key={s.id}
                    className={cn(
                      "rounded-xl border border-border bg-card p-4",
                      done && "border-green-500/30 bg-green-500/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {s.courses?.course_name ?? s.courses?.course_code}
                        </p>
                        {meta && <p className="truncate text-sm text-muted-foreground">{meta}</p>}
                      </div>
                      {!done && (
                        <Badge
                          variant="outline"
                          className="shrink-0 gap-1.5 text-green-700 dark:text-green-400"
                        >
                          <span className="relative flex size-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                          </span>
                          Live
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarClock className="size-3.5" aria-hidden="true" />
                      Started {formatStartedAt(s.scheduled_start)}
                    </p>
                    {done ? (
                      <p className="mt-3 flex h-11 items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                        <CircleCheck className="size-4" aria-hidden="true" />
                        You&apos;re registered
                      </p>
                    ) : (
                      <Button
                        className="mt-3 h-11 w-full"
                        onClick={() => void joinSession(s)}
                        disabled={submitting}
                      >
                        <ScanFace data-icon="inline-start" aria-hidden="true" />
                        Join class
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {/* Face verification: full-screen on phones, centered dialog on larger screens */}
      <Dialog
        open={stage === "verifying" && !!selectedSession && !!storedDescriptor}
        onOpenChange={(open) => {
          if (!open && !submitting) cancelVerify()
        }}
      >
        <DialogContent className={fullScreenOnMobile}>
          <DialogHeader>
            <DialogTitle>{selectedName}</DialogTitle>
            <DialogDescription>
              Look at the camera. Your attendance is recorded automatically on a match.
            </DialogDescription>
          </DialogHeader>
          {selectedSession && storedDescriptor && (
            <FaceVerifyCard
              verifyLabel={`Matching your face against your enrolled template. This registers you in ${selectedName}.`}
              stored={storedDescriptor}
              submitting={submitting}
              error={error}
              verdict={verifyResult}
              onMatch={(d) => void checkIn(d)}
              onNoMatch={(distance) => setVerifyResult({ status: "no-match", distance })}
              onRetry={() => setVerifyResult(null)}
              onCancel={cancelVerify}
            />
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
