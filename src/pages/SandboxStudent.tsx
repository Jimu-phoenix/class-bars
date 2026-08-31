import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CircleCheck, Loader2, RefreshCw, ScanFace, UserRound } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { getSandboxRole } from "@/lib/sandbox"
import {
  getSandboxParticipant,
  upsertSandboxParticipant,
} from "@/lib/sandbox"
import { usePoll } from "@/hooks/usePoll"
import { useFaceDetection } from "@/hooks/useFaceDetection"
import { euclideanDistance, isMatch } from "@/lib/faceCompare"
import SandboxShell from "@/components/SandboxShell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type {
  SandboxCheckinRow,
  SandboxParticipantRow,
  SandboxSessionRow,
} from "@/types/db"

const POLL_MS = 3000

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

type Stage = "boarding" | "idle" | "verifying" | "checkedIn"

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
    canvasRef,
    isLoading,
    error: cameraError,
    recognitionReady,
    results,
  } = useFaceDetection()
  const [name, setName] = useState("")

  const face =
    recognitionReady && results.length > 0
      ? results[0].detection.descriptor
      : null
  const descriptorReady = face !== null && face.length === 128

  return (
    <CardContent className="flex flex-col gap-5">
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <div className="relative overflow-hidden rounded-md border bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="block w-full" />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
          {(isLoading || cameraError) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/85 px-6 text-center">
              {isLoading ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Starting camera and detectors…
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Camera unavailable</p>
                  <p className="text-sm text-muted-foreground">{cameraError}</p>
                </>
              )}
            </div>
          )}
        </div>
        {!isLoading && !cameraError && (
          <p className="text-center text-xs text-muted-foreground">
            {descriptorReady
              ? "Face captured."
              : results.length > 0
                ? "Hold still while the recognizer warms up…"
                : "Position your face in view of the camera."}
          </p>
        )}
      </div>
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
      <Button
        size="lg"
        onClick={() => name.trim() && descriptorReady && onSubmit(name.trim(), face as Float32Array)}
        disabled={submitting || !descriptorReady || !name.trim()}
      >
        {submitting && <Loader2 data-icon="inline-start" className="animate-spin" />}
        Save & continue
      </Button>
    </CardContent>
  )
}

function VerifyStep({
  classNameLabel,
  participant,
  submitting,
  error,
  onMatch,
  onCancel,
}: {
  classNameLabel: string
  participant: SandboxParticipantRow
  submitting: boolean
  error: string
  onMatch: (descriptor: Float32Array) => void
  onCancel: () => void
}) {
  const {
    videoRef,
    canvasRef,
    isLoading,
    error: cameraError,
    recognitionReady,
    results,
  } = useFaceDetection()

  const stored: Float32Array | null = (() => {
    try {
      const arr = JSON.parse(participant.embedding) as number[]
      return arr.length === 128 ? new Float32Array(arr) : null
    } catch {
      return null
    }
  })()

  const liveFace =
    recognitionReady && results.length > 0
      ? results[0].detection.descriptor
      : null

  const distance =
    stored && liveFace ? euclideanDistance(stored, liveFace) : null
  const matched = distance !== null && stored !== null && liveFace !== null &&
    isMatch(stored, liveFace)

  useEffect(() => {
    if (matched && liveFace && !submitting) {
      onMatch(liveFace)
    }
  }, [matched, liveFace, submitting, onMatch])

  return (
    <CardContent className="flex flex-col gap-5">
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <div className="relative overflow-hidden rounded-md border bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="block w-full" />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
          {(isLoading || cameraError) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/85 px-6 text-center">
              {isLoading ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Starting camera and detectors…
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Camera unavailable</p>
                  <p className="text-sm text-muted-foreground">{cameraError}</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {!isLoading && !cameraError && (
        <div className="flex items-center justify-center gap-2">
          <Badge
            variant={matched ? "default" : distance !== null ? "destructive" : "outline"}
          >
            {matched ? "MATCH" : liveFace ? "NO MATCH" : "Looking for face…"}
          </Badge>
          {distance !== null && (
            <Badge variant="outline" className="font-mono text-xs">
              distance {distance.toFixed(4)}
            </Badge>
          )}
        </div>
      )}

      <div className="flex items-center justify-center">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Matching against {participant.display_name}&apos;s stored template. This checks in {classNameLabel}.
      </p>
    </CardContent>
  )
}

export default function SandboxStudent() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [participant, setParticipant] = useState<SandboxParticipantRow | null>(null)
  const [participantLoaded, setParticipantLoaded] = useState(false)
  const [stage, setStage] = useState<Stage>("idle")
  const [liveSession, setLiveSession] = useState<SandboxSessionRow | null>(null)
  const [myCheckin, setMyCheckin] = useState<SandboxCheckinRow | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

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
  }, [user])

  useEffect(() => {
    void loadParticipant()
  }, [loadParticipant])

  const loadLiveSession = useCallback(async () => {
    const { data } = await supabase
      .from("sandbox_sessions")
      .select("*")
      .eq("status", "live")
      .order("started_at", { ascending: false })
      .limit(1)

    setLiveSession((data as SandboxSessionRow[])[0] ?? null)
  }, [])

  const sessionId = liveSession?.id ?? null

  const loadMyCheckin = useCallback(async () => {
    if (!sessionId || !user) {
      setMyCheckin(null)
      return
    }
    const { data } = await supabase
      .from("sandbox_checkins")
      .select("*")
      .eq("session_id", sessionId)
      .eq("participant_id", user.id)
      .limit(1)

    setMyCheckin((data as SandboxCheckinRow[])[0] ?? null)
  }, [sessionId, user])

  usePoll(loadLiveSession, user && participantLoaded ? POLL_MS : null)
  usePoll(loadMyCheckin, sessionId && user ? POLL_MS : null)

  useEffect(() => {
    if (!participantLoaded) return
    if (!participant && myCheckin === null) {
      setStage("boarding")
    } else {
      setStage(myCheckin ? "checkedIn" : "idle")
    }
  }, [participant, participantLoaded, myCheckin])

  const saveOnboarding = async (displayName: string, descriptor: Float32Array) => {
    if (!user) return
    setSubmitting(true)
    setError("")
    try {
      const p = await upsertSandboxParticipant(
        user.id,
        displayName,
        JSON.stringify(Array.from(descriptor)),
      )
      setParticipant(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save your face")
    } finally {
      setSubmitting(false)
    }
  }

  const checkIn = async (descriptor: Float32Array) => {
    if (!user || !liveSession) return
    setSubmitting(true)
    setError("")
    try {
      const { data, error: insertError } = await supabase
        .from("sandbox_checkins")
        .insert({
          session_id: liveSession.id,
          participant_id: user.id,
          display_name: participant?.display_name ?? "Sandbox Student",
          embedding: JSON.stringify(Array.from(descriptor)),
        })
        .select("*")
        .single()

      if (insertError) {
        if (/duplicate key/i.test(insertError.message)) {
          await loadMyCheckin()
          return
        }
        throw insertError
      }
      setMyCheckin(data as SandboxCheckinRow)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check-in failed")
      setStage("idle")
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading || !user || getSandboxRole(user) !== "sandbox_student") {
    return (
      <SandboxShell>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </SandboxShell>
    )
  }

  return (
    <SandboxShell
      title="Student check-in"
      description="Onboard once, then verify your face to register attendance."
    >
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

      {stage === "idle" && !liveSession && (
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
      )}

      {stage === "idle" && liveSession && (
        <Card>
          <CardHeader>
            <CardTitle>{liveSession.class_label} is live</CardTitle>
            <CardDescription>
              Verify your face to register attendance as {participant?.display_name}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              size="lg"
              onClick={() => {
                setError("")
                setStage("verifying")
              }}
            >
              <ScanFace data-icon="inline-start" />
              Register attendance
            </Button>
          </CardContent>
        </Card>
      )}

      {stage === "verifying" && liveSession && participant && (
        <Card>
          <CardHeader>
            <CardTitle>{liveSession.class_label} — verify</CardTitle>
            <CardDescription>
              Look at the camera. Your attendance is recorded automatically on a match.
            </CardDescription>
          </CardHeader>
          <VerifyStep
            classNameLabel={liveSession.class_label}
            participant={participant}
            submitting={submitting}
            error={error}
            onMatch={(d) => void checkIn(d)}
            onCancel={() => {
              setError("")
              setStage("idle")
            }}
          />
        </Card>
      )}

      {stage === "checkedIn" && myCheckin && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CircleCheck className="size-10 text-green-600" />
            <p className="text-xl font-semibold">
              You&apos;re checked in as {myCheckin.display_name}
            </p>
            <p className="text-sm text-muted-foreground">
              Your name now appears on the lecturer&apos;s live list.
            </p>
          </CardContent>
        </Card>
      )}

      {stage !== "boarding" && participant && (
        <div className="flex items-center justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              setSubmitting(true)
              try {
                await supabase
                  .from("sandbox_participants")
                  .delete()
                  .eq("participant_id", user!.id)
                setParticipant(null)
                setMyCheckin(null)
                setStage("boarding")
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to reset onboarding")
              } finally {
                setSubmitting(false)
              }
            }}
            disabled={submitting}
          >
            <RefreshCw data-icon="inline-start" />
            Re-do onboarding
          </Button>
        </div>
      )}
    </SandboxShell>
  )
}
