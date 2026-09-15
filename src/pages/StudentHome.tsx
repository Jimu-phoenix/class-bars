import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  CalendarClock,
  CircleCheck,
  Clock,
  Loader2,
  Presentation,
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
import { FACE_MODEL_VERSION } from "@/lib/faceModels"
import { euclideanDistance } from "@/lib/faceCompare"
import { usePoll } from "@/hooks/usePoll"
import DashboardShell from "@/components/DashboardShell"
import { STUDENT_NAV } from "@/lib/nav"
import StatCard from "@/components/dashboard/StatCard"
import FaceVerifyCard, { type VerifyVerdict } from "@/components/face/FaceVerifyCard"
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

export default function StudentHome() {
  const { user, loading: authLoading } = useAuth()

  const [fullName, setFullName] = useState("")
  const [liveSessions, setLiveSessions] = useState<LiveSessionListItem[]>([])
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

  const loadEmbedding = useCallback(async () => {
    if (!user) return
    try {
      const row = await getActiveFaceEmbedding(user.id)
      if (!row) {
        setEmbedding({ status: "missing" })
      } else if (row.model_version !== FACE_MODEL_VERSION) {
        setEmbedding({ status: "stale" })
      } else {
        setEmbedding({ status: "ok" })
      }
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
    }, 0)
    return () => window.clearTimeout(timer)
  }, [user, loadEmbedding, loadStats, loadProfile])

  const refresh = useCallback(async () => {
    if (!user) return
    const { data: sessionsData, error: sessionsError } = await supabase
      .from("class_sessions")
      .select(
        "id, course_id, scheduled_start, scheduled_end, status, venues(name), courses(course_code, course_name)",
      )
      .eq("status", "ongoing")
      .order("scheduled_start", { ascending: true })

    if (sessionsError) return
    const sessionRows = (sessionsData as unknown as LiveSessionListItem[]) ?? []
    setLiveSessions(sessionRows)

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
      if (!stored || row.model_version !== FACE_MODEL_VERSION) {
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
      const distance = euclideanDistance(storedDescriptor, descriptor)
      const row = await checkInFace(selectedSession.id, user.id, distance)
      setCheckedInBySession((m) => ({ ...m, [selectedSession.id]: row }))
      setCheckedToday((n) => n + 1)
      setTotalCheckins((n) => n + 1)
      setConfirmedCheckin(row)
      setStage("confirmed")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Check-in failed"
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
      <DashboardShell roleLabel="Student dashboard" navItems={STUDENT_NAV}>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardShell>
    )
  }

  const confirmedClassName = confirmedCheckin
    ? liveSessions.find((s) => s.id === confirmedCheckin.session_id)?.courses?.course_name
    : undefined

  const faceStat =
    embedding.status === "ok"
      ? { value: "Ready", accent: "bg-emerald-500/10 text-emerald-600" as const }
      : embedding.status === "missing"
        ? { value: "Not ready", accent: "bg-destructive/10 text-destructive" as const }
        : { value: "Re-enroll", accent: "bg-amber-500/10 text-amber-600" as const }

  return (
    <DashboardShell
      roleLabel="Student dashboard"
      navItems={STUDENT_NAV}
      title="Dashboard"
      description="Here&apos;s what&apos;s live right now."
    >
      <div>
        <h1 className="heading-2">
          Welcome back{fullName ? `, ${fullName.split(" ")[0]}` : ""}
        </h1>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {(embedding.status === "missing" || embedding.status === "stale") && (
        <Card className="mb-8">
          <CardContent className="flex items-center justify-between gap-4 py-5">
            <div className="flex items-center gap-3">
              <UserRound className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">
                  {embedding.status === "missing"
                    ? "Enroll your face to check in"
                    : "Your face template is out of date"}
                </p>
                <p className="text-xs muted-text">
                  {embedding.status === "missing"
                    ? "Add your face once from your profile, then join live classes instantly."
                    : "Re-enroll your face from your profile to keep checking in."}
                </p>
              </div>
            </div>
            <Link to="/profile" className="shrink-0">
              <Button size="sm">
                <ScanFace data-icon="inline-start" aria-hidden="true" />
                Go to profile
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4 mb-8">
        <StatCard
          label="Live now"
          hint="Classes running"
          value={liveSessions.length}
          icon={Presentation}
          accent="bg-emerald-500/10 text-emerald-600"
          pulse
        />
        <StatCard
          label="Checked in today"
          hint="Starting midnight"
          value={checkedToday}
          icon={Clock}
          loading={statsLoading}
        />
        <StatCard
          label="Total check-ins"
          hint="All time"
          value={totalCheckins}
          icon={CalendarClock}
          loading={statsLoading}
        />
        <StatCard
          label="Face ready"
          hint={
            embedding.status === "missing"
              ? "Enroll from your profile"
              : embedding.status === "stale"
                ? "Model changed — re-enroll"
                : "Template verified"
          }
          value={faceStat.value}
          icon={ScanFace}
          loading={embedding.status === "loading"}
          accent={faceStat.accent}
        />
      </div>

      {stage === "verifying" && selectedSession && storedDescriptor && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Presentation className="size-4" />
              {selectedSession.courses?.course_name ?? selectedSession.courses?.course_code}
              {" · verify"}
            </CardTitle>
            <CardDescription>
              Look at the camera. Your attendance is recorded automatically on a match.
            </CardDescription>
          </CardHeader>
          <FaceVerifyCard
            verifyLabel={`Matching your face against your enrolled template. This registers you in ${selectedSession.courses?.course_name ?? selectedSession.courses?.course_code}.`}
            stored={storedDescriptor}
            submitting={submitting}
            error={error}
            verdict={verifyResult}
            onMatch={(d) => void checkIn(d)}
            onNoMatch={(distance) => setVerifyResult({ status: "no-match", distance })}
            onRetry={() => setVerifyResult(null)}
            onCancel={cancelVerify}
          />
        </Card>
      )}

      {stage === "confirmed" && confirmedCheckin && (
        <Card className="mb-8 border-green-500/30 bg-green-500/5">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CircleCheck className="size-10 text-green-600" />
            <p className="text-xl font-semibold">You&apos;re checked in</p>
            <p className="text-sm text-muted-foreground">
              {confirmedClassName ?? "Your class"} — your name now appears on the
              lecturer&apos;s live list.
            </p>
            <Button onClick={doneConfirming} className="mt-2">
              Back to classes
            </Button>
          </CardContent>
        </Card>
      )}

      {stage !== "verifying" && stage !== "confirmed" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Presentation className="size-4 text-muted-foreground" aria-hidden="true" />
              Live classes
            </CardTitle>
            <CardDescription>
              Join any class that is currently running to register your attendance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {liveSessions.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <span className="relative flex size-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-muted-foreground opacity-40" />
                  <span className="relative inline-flex size-3 rounded-full bg-muted-foreground" />
                </span>
                <p className="text-lg font-medium">No class is live right now</p>
                <p className="text-sm text-muted-foreground">
                  Ask your lecturer to start one. This page updates automatically.
                </p>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {liveSessions.map((s) => {
                  const done = checkedInBySession[s.id]
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        "rounded-xl border border-border p-5",
                        done && "border-green-500/30 bg-green-500/5",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold">
                          {s.courses?.course_name ?? s.courses?.course_code}
                        </p>
                        {done ? (
                          <Badge className="shrink-0">Checked in</Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1.5 shrink-0 text-green-700 dark:text-green-400">
                            <span className="relative flex size-1.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                            </span>
                            Live
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs muted-text">
                        {s.courses?.course_code} · {s.venues?.name}
                      </p>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CalendarClock className="size-3.5" aria-hidden="true" />
                          Started {formatStartedAt(s.scheduled_start)}
                        </p>
                        {done ? (
                          <p className="flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400">
                            <CircleCheck className="size-4" aria-hidden="true" />
                            Registered
                          </p>
                        ) : (
                          <Button size="sm" onClick={() => void joinSession(s)} disabled={submitting}>
                            <ScanFace data-icon="inline-start" aria-hidden="true" />
                            Join class
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </DashboardShell>
  )
}