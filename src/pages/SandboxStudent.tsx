import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  CalendarClock,
  CircleCheck,
  Loader2,
  Presentation,
  RefreshCw,
  ScanFace,
  UserRound,
  X,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import {
  getSandboxParticipant,
  getSandboxRole,
  upsertSandboxParticipant,
} from "@/lib/sandbox"
import { usePoll } from "@/hooks/usePoll"
import { useFaceDetection, type CapturePhase } from "@/hooks/useFaceDetection"
import { isDistanceMatch, isValidDescriptor, parseEmbedding } from "@/lib/faceCompare"
import { captureStatusMessage } from "@/lib/faceCapture"
import type { BurstResult } from "@/lib/faceBurst"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Navbar from "@/components/Navbar"
import Footer from "@/components/Footer"
import FaceCaptureFrame, { FaceDebugReadout } from "@/components/face/FaceCaptureFrame"
import type {
  SandboxCheckinRow,
  SandboxParticipantRow,
  SandboxSessionRow,
} from "@/types/db"

const POLL_MS = 3000

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

type Stage = "boarding" | "select" | "verifying" | "confirmed"

type VerifyVerdict = { status: "no-match"; distance: number } | null

function formatStartedAt(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function statusMessage(
  phase: CapturePhase,
  isWarmingUp: boolean,
  burst: BurstResult | null,
  isLoading: boolean,
  error: string | null,
): string | null {
  if (isLoading || error) return null
  if (isWarmingUp) return "Getting camera ready…"
  if (phase === "starting") return "Starting camera…"
  if (phase === "capturing") return "Capturing a clear frame…"
  if (phase === "paused") return "Camera paused. Try again to resume."
  if (burst?.ok) return "Face captured."
  if (burst && !burst.ok) return captureStatusMessage(burst.reason)
  return "Position your face in the oval."
}

function OnboardingStep({
  submitting,
  error,
  onSubmit,
}: {
  submitting: boolean
  error: string
  onSubmit: (displayName: string, descriptor: Float32Array) => void
}) {
  const {
    videoRef,
    isLoading,
    error: cameraError,
    burst,
    equivalence,
    phase,
    isWarmingUp,
    retry,
  } = useFaceDetection()
  const [name, setName] = useState("")
  const descriptor = burst?.ok ? burst.descriptor : null
  const descriptorReady = isValidDescriptor(descriptor)
  const canRetry =
    !isLoading &&
    !cameraError &&
    !submitting &&
    (phase === "failed" || phase === "paused")

  const handleSubmit = () => {
    if (!isValidDescriptor(descriptor) || !name.trim()) return
    onSubmit(name.trim(), descriptor)
  }

  return (
    <CardContent className="flex flex-col gap-5">
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <FaceCaptureFrame
        videoRef={videoRef}
        isLoading={isLoading}
        error={cameraError}
        status={statusMessage(phase, isWarmingUp, burst, isLoading, cameraError)}
        debugReadout={<FaceDebugReadout burst={burst} equivalence={equivalence} />}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="display_name" className="text-sm font-medium">
          Display name
        </label>
        <input
          id="display_name"
          required
          maxLength={60}
          placeholder="e.g. Alice Banda"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex gap-3">
        <Button
          className="flex-1"
          size="lg"
          onClick={handleSubmit}
          disabled={submitting || !descriptorReady || !name.trim()}
        >
          {submitting && <Loader2 data-icon="inline-start" className="animate-spin" />}
          Save & continue
        </Button>
        {canRetry && (
          <Button variant="outline" size="lg" onClick={retry} disabled={submitting}>
            <RefreshCw data-icon="inline-start" />
            Try again
          </Button>
        )}
      </div>
    </CardContent>
  )
}

function VerifyStep({
  classNameLabel,
  participant,
  submitting,
  error,
  verdict,
  onMatch,
  onNoMatch,
  onRetry,
  onCancel,
}: {
  classNameLabel: string
  participant: SandboxParticipantRow
  submitting: boolean
  error: string
  verdict: VerifyVerdict
  onMatch: (descriptor: Float32Array, distance: number) => void
  onNoMatch: (distance: number) => void
  onRetry: () => void
  onCancel: () => void
}) {
  const stored = (() => {
    const parsed = parseEmbedding(participant.embedding)
    return parsed && isValidDescriptor(parsed) ? parsed : null
  })()

  const {
    videoRef,
    isLoading,
    error: cameraError,
    burst,
    equivalence,
    phase,
    isWarmingUp,
    retry,
  } = useFaceDetection({ referenceDescriptor: stored })
  const handledBurstRef = useRef<BurstResult | null>(null)

  useEffect(() => {
    if (!burst || handledBurstRef.current === burst) return
    handledBurstRef.current = burst
    if (!burst.ok) return
    const distance = burst.combinedDistance
    if (distance === null || !Number.isFinite(distance)) return
    if (!isValidDescriptor(burst.descriptor)) return
    if (isDistanceMatch(distance)) {
      onMatch(burst.descriptor, distance)
    } else {
      onNoMatch(distance)
    }
  }, [burst, onMatch, onNoMatch])

  if (!stored) {
    return (
      <CardContent className="flex flex-col gap-4">
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Your stored sandbox face template is invalid. Re-do onboarding to continue.
        </p>
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Back to classes
        </Button>
      </CardContent>
    )
  }

  const captureFailed = burst !== null && !burst.ok
  const canRetry =
    !isLoading &&
    !cameraError &&
    !submitting &&
    (verdict !== null || captureFailed || phase === "paused")
  const handleRetry = () => {
    onRetry()
    retry()
  }

  return (
    <CardContent className="flex flex-col gap-5">
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <FaceCaptureFrame
        videoRef={videoRef}
        isLoading={isLoading}
        error={cameraError}
        status={verdict ? null : statusMessage(phase, isWarmingUp, burst, isLoading, cameraError)}
        debugReadout={<FaceDebugReadout burst={burst} equivalence={equivalence} />}
      />

      {!isLoading && !cameraError && (
        <div className="flex flex-col items-center gap-2.5">
          <div className="flex items-center justify-center gap-2">
            {submitting ? (
              <Badge variant="outline" className="gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Recording attendance…
              </Badge>
            ) : verdict ? (
              <>
                <Badge variant="destructive">NO MATCH</Badge>
                <Badge variant="outline" className="font-mono text-xs">
                  distance {verdict.distance.toFixed(4)}
                </Badge>
              </>
            ) : captureFailed ? (
              <Badge variant="outline">Capture failed</Badge>
            ) : (
              <Badge variant="outline">Looking for face…</Badge>
            )}
          </div>
          {canRetry && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetry}
              disabled={submitting}
            >
              <RefreshCw data-icon="inline-start" />
              Try again
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center justify-center">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Matching against {participant.display_name}&apos;s stored template. This registers you in {classNameLabel}.
      </p>
    </CardContent>
  )
}

export default function SandboxStudent() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [participant, setParticipant] = useState<SandboxParticipantRow | null>(null)
  const [participantLoaded, setParticipantLoaded] = useState(false)
  const [stage, setStage] = useState<Stage>("boarding")
  const [liveSessions, setLiveSessions] = useState<SandboxSessionRow[]>([])
  const [checkedInBySession, setCheckedInBySession] = useState<
    Record<string, SandboxCheckinRow>
  >({})
  const [selectedSession, setSelectedSession] = useState<SandboxSessionRow | null>(null)
  const [confirmedCheckin, setConfirmedCheckin] = useState<SandboxCheckinRow | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [verifyResult, setVerifyResult] = useState<VerifyVerdict>(null)

  useEffect(() => {
    if (!authLoading && (!user || getSandboxRole(user) !== "sandbox_student")) {
      navigate("/sandbox", { replace: true })
    }
  }, [user, authLoading, navigate])

  const loadParticipant = useCallback(async () => {
    if (!user) return
    const p = await getSandboxParticipant(user.id)
    setParticipant(p)
    setParticipantLoaded(true)
    setStage(p ? "select" : "boarding")
  }, [user])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadParticipant(), 0)
    return () => window.clearTimeout(timer)
  }, [loadParticipant])

  const refresh = useCallback(async () => {
    if (!user) return
    const { data: sessionsData, error: sessionsError } = await supabase
      .from("sandbox_sessions")
      .select("*")
      .eq("status", "live")
      .order("started_at", { ascending: false })

    if (sessionsError) return
    const sessionRows = (sessionsData as SandboxSessionRow[] | null) ?? []
    setLiveSessions(sessionRows)

    if (sessionRows.length === 0) {
      setCheckedInBySession({})
      return
    }

    const { data: checkinsData, error: checkinsError } = await supabase
      .from("sandbox_checkins")
      .select("*")
      .in("session_id", sessionRows.map((s) => s.id))
      .eq("participant_id", user.id)

    if (checkinsError) return
    const map: Record<string, SandboxCheckinRow> = {}
    for (const c of (checkinsData as SandboxCheckinRow[] | null) ?? []) {
      map[c.session_id] = c
    }
    setCheckedInBySession(map)
  }, [user])

  usePoll(refresh, user && participantLoaded ? POLL_MS : null)

  const saveOnboarding = async (displayName: string, descriptor: Float32Array) => {
    if (!user) return
    if (!isValidDescriptor(descriptor)) {
      setError("Face capture was invalid. Try again.")
      return
    }
    setSubmitting(true)
    setError("")
    try {
      const p = await upsertSandboxParticipant(
        user.id,
        displayName,
        JSON.stringify(Array.from(descriptor)),
      )
      setParticipant(p)
      setStage("select")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save your face")
    } finally {
      setSubmitting(false)
    }
  }

  const selectClass = (session: SandboxSessionRow) => {
    setError("")
    setVerifyResult(null)
    setSelectedSession(session)
    setStage("verifying")
  }

  const cancelVerify = () => {
    setError("")
    setVerifyResult(null)
    setSelectedSession(null)
    setStage("select")
  }

  const checkIn = async (descriptor: Float32Array, distance: number) => {
    if (!user || !selectedSession) return
    if (!isValidDescriptor(descriptor) || !Number.isFinite(distance)) {
      setError("Face capture was invalid. Try again.")
      setVerifyResult(null)
      return
    }
    if (!liveSessions.some((s) => s.id === selectedSession.id)) {
      setSelectedSession(null)
      setVerifyResult(null)
      setStage("select")
      setError("That class is no longer live.")
      return
    }
    setSubmitting(true)
    setError("")
    try {
      const { data, error: insertError } = await supabase
        .from("sandbox_checkins")
        .insert({
          session_id: selectedSession.id,
          participant_id: user.id,
          display_name: participant?.display_name ?? "Sandbox Student",
          embedding: JSON.stringify(Array.from(descriptor)),
        })
        .select("*")
        .single()

      let row = (data as SandboxCheckinRow | null) ?? null
      if (insertError) {
        if (!/duplicate key/i.test(insertError.message)) throw insertError
        const { data: existing } = await supabase
          .from("sandbox_checkins")
          .select("*")
          .eq("session_id", selectedSession.id)
          .eq("participant_id", user.id)
          .maybeSingle()
        row = (existing as SandboxCheckinRow | null) ?? null
        if (!row) throw insertError
      }

      if (row) {
        setCheckedInBySession((m) => ({ ...m, [selectedSession.id]: row as SandboxCheckinRow }))
        setConfirmedCheckin(row)
        setStage("confirmed")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed")
      setVerifyResult(null)
    } finally {
      setSubmitting(false)
    }
  }

  const doneConfirming = () => {
    setConfirmedCheckin(null)
    setVerifyResult(null)
    setSelectedSession(null)
    setStage("select")
  }

  const redoOnboarding = async () => {
    if (!user) return
    setSubmitting(true)
    setError("")
    try {
      await supabase
        .from("sandbox_participants")
        .delete()
        .eq("participant_id", user.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset onboarding")
      setSubmitting(false)
      return
    }
    setSubmitting(false)
    setParticipant(null)
    setCheckedInBySession({})
    setConfirmedCheckin(null)
    setVerifyResult(null)
    setSelectedSession(null)
    setStage("boarding")
  }

  if (authLoading || !user || getSandboxRole(user) !== "sandbox_student") {
    return (
      <div className="min-h-screen flex flex-col relative overflow-hidden bg-background">
        <Navbar />
        <main className="flex-1 relative z-10 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    )
  }

  const confirmedClassName =
    confirmedCheckin
      ? liveSessions.find((s) => s.id === confirmedCheckin.session_id)?.class_label
      : undefined

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-background">
      <Navbar />

      <main className="flex-1 relative z-10">
        <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true">
          <div className="absolute inset-0 hero-gradient opacity-5" />
          <div className="absolute inset-0 hero-gradient-bottom opacity-10" />
          <div className="absolute inset-0 opacity-20 grid-bg-primary" />
          <div className="absolute inset-0 opacity-10 grid-bg-secondary animate-grid-move" />
        </div>

        <div className="relative py-8 md:py-12 lg:py-16 px-4 md:px-6 lg:px-8">
          <div className="container-default">
            <div className="max-w-4xl mx-auto">
              <header className="mb-8">
                <h1 className="heading-2 font-heading">Student Check-in</h1>
                <p className="mt-2 body-lg muted-text">
                  Pick a live class, then verify your face to register attendance.
                </p>
              </header>

              {error && (
                <p className="mb-6 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              {stage === "boarding" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserRound className="size-4" />
                      Onboard yourself
                    </CardTitle>
                    <CardDescription>
                      Enter your display name and record your face once. We&apos;ll use this template to verify you at check-in.
                    </CardDescription>
                  </CardHeader>
                  <OnboardingStep
                    submitting={submitting}
                    error={error}
                    onSubmit={saveOnboarding}
                  />
                </Card>
              )}

              {stage === "select" &&
                (liveSessions.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                      <span className="relative flex size-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-muted-foreground opacity-40" />
                        <span className="relative inline-flex size-3 rounded-full bg-muted-foreground" />
                      </span>
                      {participant && (
                        <p className="text-sm font-medium text-muted-foreground">
                          Enrolled as {participant.display_name}
                        </p>
                      )}
                      <p className="text-lg font-medium">No class is live right now</p>
                      <p className="text-sm text-muted-foreground">
                        Ask your lecturer to start one. This page updates automatically.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {liveSessions.map((s) => {
                      const done = checkedInBySession[s.id]
                      return (
                        <Card
                          key={s.id}
                          className={cn(
                            done && "border-green-500/30 bg-green-500/5",
                          )}
                        >
                          <CardHeader>
                            <div className="flex items-start justify-between gap-2">
                              <CardTitle className="flex items-center gap-2">
                                <Presentation className="size-4 shrink-0 text-muted-foreground" />
                                <span className="truncate">{s.class_label}</span>
                              </CardTitle>
                              {done ? (
                                <Badge>Checked in</Badge>
                              ) : (
                                <Badge variant="outline" className="text-green-700 dark:text-green-400">
                                  Live
                                </Badge>
                              )}
                            </div>
                            <CardDescription>
                              {s.course_label} · {s.venue_label}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="flex items-center justify-between gap-3">
                              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <CalendarClock className="size-3.5" aria-hidden="true" />
                                Started {formatStartedAt(s.started_at)}
                              </p>
                              {done ? (
                                <p className="flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400">
                                  <CircleCheck className="size-4" />
                                  Registered
                                </p>
                              ) : (
                                <Button size="sm" onClick={() => selectClass(s)} disabled={submitting}>
                                  <ScanFace data-icon="inline-start" />
                                  Join class
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                ))}

              {stage === "verifying" && selectedSession && participant && (
                <Card>
                  <CardHeader>
                    <CardTitle>{selectedSession.class_label} — verify</CardTitle>
                    <CardDescription>
                      Look at the camera. Your attendance is recorded automatically on a match.
                    </CardDescription>
                  </CardHeader>
                  <VerifyStep
                    classNameLabel={selectedSession.class_label}
                    participant={participant}
                    submitting={submitting}
                    error={error}
                    verdict={verifyResult}
                    onMatch={(d, distance) => void checkIn(d, distance)}
                    onNoMatch={(distance) => setVerifyResult({ status: "no-match", distance })}
                    onRetry={() => setVerifyResult(null)}
                    onCancel={cancelVerify}
                  />
                </Card>
              )}

              {stage === "confirmed" && confirmedCheckin && (
                <Card className="border-green-500/30 bg-green-500/5">
                  <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                    <CircleCheck className="size-10 text-green-600" />
                    <p className="text-xl font-semibold">
                      You&apos;re checked in as {confirmedCheckin.display_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {confirmedClassName ?? "Your class"} — your name now appears on the lecturer&apos;s live list.
                    </p>
                    <Button onClick={doneConfirming} className="mt-2">
                      Back to classes
                    </Button>
                  </CardContent>
                </Card>
              )}

              {stage !== "boarding" && participant && (
                <div className="mt-6 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void redoOnboarding()}
                    disabled={submitting}
                  >
                    <RefreshCw data-icon="inline-start" />
                    Re-do onboarding
                  </Button>
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/sandbox")}
                  disabled={submitting}
                >
                  <X className="size-4" aria-hidden="true" />
                  Leave Sandbox
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}