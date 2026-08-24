import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CircleCheck, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { getSandboxRole } from "@/lib/sandbox"
import { usePoll } from "@/hooks/usePoll"
import { useFaceDetection } from "@/hooks/useFaceDetection"
import SandboxShell from "@/components/SandboxShell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { SandboxCheckinRow, SandboxSessionRow } from "@/types/db"

const POLL_MS = 3000

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

type CaptureStepProps = {
  classNameLabel: string
  submitting: boolean
  error: string
  onSubmit: (displayName: string, descriptor: Float32Array) => void
}

function CaptureStep({ classNameLabel, submitting, error, onSubmit }: CaptureStepProps) {
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
        Check in to {classNameLabel}
      </Button>
    </CardContent>
  )
}

export default function SandboxStudent() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [liveSession, setLiveSession] = useState<SandboxSessionRow | null>(null)
  const [myCheckin, setMyCheckin] = useState<SandboxCheckinRow | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!authLoading && (!user || getSandboxRole(user) !== "sandbox_student")) {
      navigate("/sandbox", { replace: true })
    }
  }, [user, authLoading, navigate])

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

  usePoll(loadLiveSession, user ? POLL_MS : null)
  usePoll(loadMyCheckin, sessionId && user ? POLL_MS : null)

  const checkIn = async (displayName: string, descriptor: Float32Array) => {
    if (!user || !liveSession) return
    setSubmitting(true)
    setError("")
    try {
      const { data, error: insertError } = await supabase
        .from("sandbox_checkins")
        .insert({
          session_id: liveSession.id,
          participant_id: user.id,
          display_name: displayName,
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
      description="Face capture only — no OTP, no location checks."
    >
      {!liveSession ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="relative flex size-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-muted-foreground opacity-40" />
              <span className="relative inline-flex size-3 rounded-full bg-muted-foreground" />
            </span>
            <p className="text-lg font-medium">No class is live right now</p>
            <p className="text-sm text-muted-foreground">
              Ask your lecturer to start one. This page updates automatically.
            </p>
          </CardContent>
        </Card>
      ) : myCheckin ? (
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
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{liveSession.class_label} is live</CardTitle>
            <CardDescription>Capture your face and enter a display name.</CardDescription>
          </CardHeader>
          <CaptureStep
            classNameLabel={liveSession.class_label}
            submitting={submitting}
            error={error}
            onSubmit={(displayName, descriptor) => void checkIn(displayName, descriptor)}
          />
        </Card>
      )}
    </SandboxShell>
  )
}
