import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  CalendarClock,
  CircleCheck,
  Clock,
  Loader2,
  LocateFixed,
  MapPin,
  Presentation,
  RefreshCw,
  ScanFace,
  UserRound,
} from "lucide-react"
import { Circle, CircleMarker, MapContainer, Polygon, TileLayer, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import {
  checkInFace,
  getActiveFaceEmbedding,
  parseEmbedding,
  FACE_MODEL_VERSION,
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
import OtpFallbackCard from "@/components/face/OtpFallbackCard"
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

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

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
  return { label: "Poor", className: "bg-destructive/10 text-destructive"   }
}

type TempFenceRow = {
  session_id: string
  venue_id: string | null
  venue_name: string | null
  fence_id: string | null
  geofence_id?: string | null
  shape: string | null
  center_lat: number | null
  center_lng: number | null
  radius_m: number | null
  c1_lat: number | null
  c1_lng: number | null
  c2_lat: number | null
  c2_lng: number | null
  c3_lat: number | null
  c3_lng: number | null
  c4_lat: number | null
  c4_lng: number | null
}

function FitBounds({
  positions,
}: {
  positions: [number, number][]
}) {
  const map = useMap()
  useEffect(() => {
    if (positions.length === 0) return
    const bounds = L.latLngBounds(positions)
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.25))
    }
  }, [map, positions])
  return null
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
  const [verifyMode, setVerifyMode] = useState<"face" | "otp">("face")

  const [checkLocOpen, setCheckLocOpen] = useState(false)
  const [checkLocSession, setCheckLocSession] = useState<LiveSessionListItem | null>(null)
  const [fenceLoading, setFenceLoading] = useState(false)
  const [fenceError, setFenceError] = useState("")
  const [fenceData, setFenceData] = useState<TempFenceRow | null>(null)
  const [studentPos, setStudentPos] = useState<Coordinates | null>(null)
  const [posLoading, setPosLoading] = useState(false)
  const [posError, setPosError] = useState("")

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
      if (row.model_version !== FACE_MODEL_VERSION) {
        setEmbedding({ status: "stale" })
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
    setVerifyMode("face")
    try {
      const row = await getActiveFaceEmbedding(user.id)
      if (!row) {
        setError("You have no face template yet. Enroll your face from your profile first.")
        return
      }
      if (row.model_version !== FACE_MODEL_VERSION) {
        setError("Your face template is out of date. Re-enroll it from your profile.")
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
    setVerifyMode("face")
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

  const openCheckLocation = async (session: LiveSessionListItem) => {
    setCheckLocSession(session)
    setCheckLocOpen(true)
    setFenceError("")
    setFenceData(null)
    setStudentPos(null)
    setPosError("")
    setFenceLoading(true)
    setPosLoading(true)
    try {
      console.log("calling rpc for", session.id)
      const rpcRes = await supabase.rpc("get_session_geofence_test", { p_session_id: session.id })
      console.log("rpcRes", rpcRes)
      const fence = rpcRes.data
      const fenceErr = rpcRes.error
      if (fenceErr) throw fenceErr
      const raw = Array.isArray(fence) ? fence[0] : fence
      setFenceData((raw as TempFenceRow) ?? null)
      const pos = await getCurrentPosition()
      setStudentPos(pos)
    } catch (err) {
      console.log("checkLoc catch", err)
      setFenceError(err instanceof Error ? err.message : "Failed to load location check")
      try {
        const pos = await getCurrentPosition()
        setStudentPos(pos)
      } catch (pErr) {
        setPosError(
          geolocationErrorMessage(pErr) ??
            (pErr instanceof Error ? pErr.message : "Could not get your location"),
        )
      }
    } finally {
      setFenceLoading(false)
      setPosLoading(false)
    }
  }

  const refreshStudentPos = async () => {
    setPosLoading(true)
    setPosError("")
    try {
      setStudentPos(await getCurrentPosition())
    } catch (err) {
      setPosError(
        geolocationErrorMessage(err) ??
          (err instanceof Error ? err.message : "Could not get your location"),
      )
    } finally {
      setPosLoading(false)
    }
  }

  const doneConfirming = () => {
    setConfirmedCheckin(null)
    setVerifyResult(null)
    setStoredDescriptor(null)
    setSelectedSession(null)
    setStage("select")
    setVerifyMode("face")
    void loadStats()
  }

  const handleOtpSuccess = async (result: { flagged: boolean }) => {
    if (!selectedSession || !user) return
    try {
      const { data } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("session_id", selectedSession.id)
        .eq("student_id", user.id)
        .maybeSingle()
      if (data) {
        setCheckedInBySession((m) => ({ ...m, [selectedSession.id]: data as AttendanceRecordRow }))
        setCheckedToday((n) => n + 1)
        setTotalCheckins((n) => n + 1)
        setConfirmedCheckin(data as AttendanceRecordRow)
        setStage("confirmed")
        setVerifyMode("face")
        setError("")
        setVerifyResult(null)
      } else {
        // Fallback if record not immediately visible
        setError(result.flagged ? FLAGGED_CHECKIN_MESSAGE : "Checked in successfully")
        setVerifyMode("face")
        setStoredDescriptor(null)
        setSelectedSession(null)
        setStage("select")
        void refresh()
        void loadStats()
      }
    } catch {
      setError(result.flagged ? FLAGGED_CHECKIN_MESSAGE : "Checked in successfully")
      setVerifyMode("face")
      setStoredDescriptor(null)
      setSelectedSession(null)
      setStage("select")
      void refresh()
      void loadStats()
    }
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
                      <div className="mt-3 grid gap-2">
                        <Button
                          className="h-11 w-full"
                          onClick={() => void joinSession(s)}
                          disabled={submitting}
                        >
                          <ScanFace data-icon="inline-start" aria-hidden="true" />
                          Join class
                        </Button>
                        <Button
                          variant="outline"
                          className="h-9 w-full"
                          onClick={() => void openCheckLocation(s)}
                        >
                          <MapPin data-icon="inline-start" aria-hidden="true" />
                          Check location (test)
                        </Button>
                      </div>
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
        open={stage === "verifying" && !!selectedSession}
        onOpenChange={(open) => {
          if (!open && !submitting && verifyMode === "face") cancelVerify()
          else if (!open && verifyMode === "otp") cancelVerify()
        }}
      >
        <DialogContent className={fullScreenOnMobile}>
          <DialogHeader>
            <DialogTitle>{selectedName}</DialogTitle>
            <DialogDescription>
              {verifyMode === "face"
                ? "Look at the camera. Your attendance is recorded automatically on a match."
                : "Enter the code sent to your email to check in."}
            </DialogDescription>
          </DialogHeader>
          {selectedSession && verifyMode === "face" && storedDescriptor && (
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
              onUseOtp={() => {
                setVerifyMode("otp")
                setError("")
                setVerifyResult(null)
              }}
            />
          )}
          {selectedSession && verifyMode === "otp" && (
            <OtpFallbackCard
              sessionId={selectedSession.id}
              getLocation={getCurrentPosition}
              onSuccess={(result) => void handleOtpSuccess(result)}
              onBackToFace={() => {
                setVerifyMode("face")
                setError("")
              }}
              onCancel={cancelVerify}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={checkLocOpen} onOpenChange={setCheckLocOpen}>
        <DialogContent className={fullScreenOnMobile}>
          <DialogHeader>
            <DialogTitle>Check location (test)</DialogTitle>
            <DialogDescription>
              {checkLocSession?.courses?.course_name ?? checkLocSession?.courses?.course_code ?? "Class"}{" "}
              {checkLocSession?.venues?.name ? `· ${checkLocSession.venues.name}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(fenceLoading || posLoading) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading fence and location...
              </div>
            )}
            {fenceError && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {fenceError}
              </p>
            )}
            {posError && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {posError}
              </p>
            )}
            {fenceData && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <p className="font-medium">Venue: {fenceData.venue_name || "—"}</p>
                {fenceData.fence_id ? (
                  <p className="text-muted-foreground">
                    Fence: {fenceData.shape} {fenceData.shape === "circle" && fenceData.radius_m ? `(${fenceData.radius_m} m)` : ""}
                  </p>
                ) : (
                  <p className="text-muted-foreground">No geofence set for this venue</p>
                )}
              </div>
            )}
            {studentPos && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
                <p className="font-medium">Your location (test)</p>
                <p className="text-muted-foreground">
                  Lat: {studentPos.latitude.toFixed(6)}, Lng: {studentPos.longitude.toFixed(6)}
                </p>
                <p className="text-muted-foreground">Accuracy: ±{Math.round(studentPos.accuracy)} m</p>
                <Button size="sm" variant="outline" onClick={() => void refreshStudentPos()} disabled={posLoading}>
                  <RefreshCw className={cn("size-3.5", posLoading && "animate-spin")} />
                  Refresh position
                </Button>
              </div>
            )}
            {fenceData?.fence_id && fenceData.shape === "circle" && fenceData.center_lat != null && fenceData.center_lng != null && fenceData.radius_m != null ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <MapContainer
                  center={[fenceData.center_lat, fenceData.center_lng]}
                  zoom={18}
                  maxZoom={22}
                  scrollWheelZoom={false}
                  className="h-64 w-full sm:h-80"
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' maxZoom={22} />
                  <Circle
                    center={[fenceData.center_lat, fenceData.center_lng]}
                    radius={fenceData.radius_m}
                    pathOptions={{ color: "#2563eb", weight: 2, fillColor: "#2563eb", fillOpacity: 0.12 }}
                  />
                  {studentPos && (
                    <>
                      <CircleMarker center={[studentPos.latitude, studentPos.longitude]} radius={6} pathOptions={{ color: "#16a34a", weight: 2, fillColor: "#22c55e", fillOpacity: 0.9 }} />
                      <Circle center={[studentPos.latitude, studentPos.longitude]} radius={studentPos.accuracy} pathOptions={{ color: "#22c55e", weight: 1, fillColor: "#22c55e", fillOpacity: 0.08 }} />
                    </>
                  )}
                  <FitBounds positions={[[fenceData.center_lat, fenceData.center_lng], ...(studentPos ? [[studentPos.latitude, studentPos.longitude] as [number, number]] : [])]} />
                </MapContainer>
              </div>
            ) : fenceData?.fence_id && fenceData.shape === "box" && [fenceData.c1_lat, fenceData.c1_lng, fenceData.c2_lat, fenceData.c2_lng, fenceData.c3_lat, fenceData.c3_lng, fenceData.c4_lat, fenceData.c4_lng].every((v) => v != null) ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <MapContainer
                  center={[fenceData.c1_lat!, fenceData.c1_lng!]}
                  zoom={18}
                  maxZoom={22}
                  scrollWheelZoom={false}
                  className="h-64 w-full sm:h-80"
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' maxZoom={22} />
                  <Polygon
                    positions={[
                      [fenceData.c1_lat!, fenceData.c1_lng!],
                      [fenceData.c2_lat!, fenceData.c2_lng!],
                      [fenceData.c3_lat!, fenceData.c3_lng!],
                      [fenceData.c4_lat!, fenceData.c4_lng!],
                    ]}
                    pathOptions={{ color: "#2563eb", weight: 2, fillColor: "#2563eb", fillOpacity: 0.12 }}
                  />
                  {studentPos && (
                    <>
                      <CircleMarker center={[studentPos.latitude, studentPos.longitude]} radius={6} pathOptions={{ color: "#16a34a", weight: 2, fillColor: "#22c55e", fillOpacity: 0.9 }} />
                      <Circle center={[studentPos.latitude, studentPos.longitude]} radius={studentPos.accuracy} pathOptions={{ color: "#22c55e", weight: 1, fillColor: "#22c55e", fillOpacity: 0.08 }} />
                    </>
                  )}
                  <FitBounds positions={[
                    [fenceData.c1_lat!, fenceData.c1_lng!],
                    [fenceData.c2_lat!, fenceData.c2_lng!],
                    [fenceData.c3_lat!, fenceData.c3_lng!],
                    [fenceData.c4_lat!, fenceData.c4_lng!],
                    ...(studentPos ? [[studentPos.latitude, studentPos.longitude] as [number, number]] : []),
                  ]} />
                </MapContainer>
              </div>
            ) : fenceData?.fence_id ? (
              <p className="text-sm text-muted-foreground">Fence data incomplete for display.</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}
