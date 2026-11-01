import { useState } from "react"
import { Link } from "react-router-dom"
import { RefreshCw, Trash2 } from "lucide-react"
import { useFaceDetection } from "@/hooks/useFaceDetection"
import { isDistanceMatch, isValidDescriptor } from "@/lib/faceCompare"
import { captureStatusMessage } from "@/lib/faceCapture"
import type { BurstResult } from "@/lib/faceBurst"
import FaceCaptureFrame, { FaceDebugReadout } from "@/components/face/FaceCaptureFrame"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Mode = "register" | "verify"

function formatDescriptor(desc: Float32Array): string {
  const values = Array.from(desc.slice(0, 10))
    .map((v) => v.toFixed(4))
    .join(", ")
  return `[${values}, ...] (128-d total)`
}

function statusMessage(
  phase: ReturnType<typeof useFaceDetection>["phase"],
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
  if (burst?.ok) return "Burst captured."
  if (burst && !burst.ok) return captureStatusMessage(burst.reason)
  return "Position your face in the oval."
}

function RegisterPanel({
  onRegistered,
}: {
  onRegistered: (descriptor: Float32Array) => void
}) {
  const {
    videoRef,
    isLoading,
    error,
    burst,
    equivalence,
    phase,
    isWarmingUp,
    retry,
  } = useFaceDetection({ mode: "enrol" })
  const descriptor = burst?.ok ? burst.descriptor : null
  const validDescriptor = isValidDescriptor(descriptor) ? descriptor : null
  const ready = validDescriptor !== null

  const handleSave = () => {
    if (!validDescriptor) return
    onRegistered(validDescriptor)
  }

  return (
    <div className="flex flex-col gap-3">
      <FaceCaptureFrame
        videoRef={videoRef}
        isLoading={isLoading}
        error={error}
        status={statusMessage(phase, isWarmingUp, burst, isLoading, error)}
        debugReadout={<FaceDebugReadout burst={burst} equivalence={equivalence} />}
      />
      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={!ready}>
          Register this face
        </Button>
        <Button
          variant="outline"
          onClick={retry}
          disabled={isLoading || phase === "capturing" || phase === "starting"}
        >
          <RefreshCw data-icon="inline-start" />
          New burst
        </Button>
      </div>
      {validDescriptor && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Burst descriptor</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="break-all font-mono text-xs text-foreground">
              {formatDescriptor(validDescriptor)}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function VerifyPanel({
  registered,
  onClear,
}: {
  registered: Float32Array
  onClear: () => void
}) {
  const {
    videoRef,
    isLoading,
    error,
    burst,
    equivalence,
    phase,
    isWarmingUp,
    retry,
  } = useFaceDetection({ referenceDescriptor: registered })
  const distance = burst?.ok ? burst.combinedDistance : null
  const match =
    distance !== null
      ? { match: isDistanceMatch(distance) }
      : null

  const handleNewBurst = () => {
    retry()
  }

  return (
    <div className="flex flex-col gap-3">
      <FaceCaptureFrame
        videoRef={videoRef}
        isLoading={isLoading}
        error={error}
        status={match ? null : statusMessage(phase, isWarmingUp, burst, isLoading, error)}
        debugReadout={
          <FaceDebugReadout burst={burst} equivalence={equivalence} />
        }
      />
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={handleNewBurst}
          disabled={isLoading || phase === "capturing" || phase === "starting"}
        >
          <RefreshCw data-icon="inline-start" />
          New burst
        </Button>
        <Button variant="ghost" onClick={onClear}>
          <Trash2 data-icon="inline-start" />
          Clear registered face
        </Button>
      </div>

      {match && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Verification result</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Badge variant={match.match ? "default" : "destructive"}>
              {match.match ? "MATCH" : "NO MATCH"}
            </Badge>
          </CardContent>
        </Card>
      )}

      <Card size="sm">
        <CardHeader>
          <CardTitle>Registered face</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="break-all font-mono text-xs text-foreground">
            {formatDescriptor(registered)}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function FaceVerify() {
  const [mode, setMode] = useState<Mode>("register")
  const [registered, setRegistered] = useState<Float32Array | null>(null)

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 md:p-8">
      <header className="flex items-center justify-between">
        <div>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            &larr; Back to Home
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-foreground">
            Face Verification
          </h1>
          <p className="text-sm text-muted-foreground">
            Diagnostic page — burst register and burst verify without localStorage
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="w-full lg:w-1/2">
          <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-lg font-semibold text-foreground">
              {mode === "register" ? "Register New Face" : "Verify Face"}
            </h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={mode === "register" ? "default" : "ghost"}
                onClick={() => setMode("register")}
              >
                Register
              </Button>
              <Button
                size="sm"
                variant={mode === "verify" ? "default" : "ghost"}
                onClick={() => setMode("verify")}
                disabled={!registered}
              >
                Verify
              </Button>
            </div>
          </div>

          {mode === "register" || !registered ? (
            <RegisterPanel
              onRegistered={(descriptor) => {
                setRegistered(descriptor)
                setMode("verify")
              }}
            />
          ) : (
            <VerifyPanel
              registered={registered}
              onClear={() => {
                setRegistered(null)
                setMode("register")
              }}
            />
          )}
        </div>

        <div className="w-full lg:w-1/2">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>
                Registration uses the averaged descriptor from a quality-gated burst.
                Verification uses the median distance from a second burst.
              </p>
              <p>
                Nothing is written to localStorage. The registered template lives in
                memory for this page only.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
