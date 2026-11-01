import { useEffect, useRef } from "react"
import { KeyRound, Loader2, RefreshCw } from "lucide-react"
import { useFaceDetection } from "@/hooks/useFaceDetection"
import { isValidDescriptor } from "@/lib/faceCompare"
import { captureStatusMessage } from "@/lib/faceCapture"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"
import FaceCaptureFrame, { FaceDebugReadout } from "@/components/face/FaceCaptureFrame"
import type { BurstResult } from "@/lib/faceBurst"

export type VerifyVerdict = { status: "no-match" } | null

export default function FaceVerifyCard({
  verifyLabel,
  stored,
  submitting,
  error,
  verdict,
  onCaptured,
  onRetry,
  onCancel,
  onUseOtp,
  attempts,
  maxAttempts = 3,
}: {
  verifyLabel: string
  stored: Float32Array
  submitting: boolean
  error: string
  verdict: VerifyVerdict
  onCaptured: (descriptor: Float32Array, distance: number) => void
  onRetry: () => void
  onCancel: () => void
  onUseOtp?: () => void
  attempts: number
  maxAttempts?: number
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
  } = useFaceDetection({ referenceDescriptor: stored })

  const handledBurstRef = useRef<BurstResult | null>(null)

  useEffect(() => {
    if (!burst || handledBurstRef.current === burst) return
    handledBurstRef.current = burst
    if (!burst.ok) return

    const distance = burst.combinedDistance
    if (distance === null || !Number.isFinite(distance)) return
    if (!isValidDescriptor(burst.descriptor)) return

    onCaptured(burst.descriptor, distance)
  }, [burst, onCaptured])

  const captureFailed = burst !== null && !burst.ok
  const canTryAgain =
    !submitting &&
    !isWarmingUp &&
    phase !== "capturing" &&
    phase !== "starting"
  const showOtp =
    onUseOtp !== undefined &&
    !submitting &&
    (attempts >= 2 ||
      attempts >= maxAttempts ||
      (burst !== null && !burst.ok && burst.reason === "timeout"))

  const status = (() => {
    if (isLoading || cameraError) return null
    if (isWarmingUp) return "Getting camera ready…"
    if (phase === "starting") return "Starting camera…"
    if (phase === "capturing") return "Capturing a clear frame…"
    if (phase === "paused") return "Camera paused. Try again to resume."
    if (verdict) return null
    if (burst && !burst.ok) return captureStatusMessage(burst.reason)
    if (burst?.ok) return "Checking your face…"
    return "Position your face in the oval."
  })()

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
        status={status}
        debugReadout={
          <FaceDebugReadout burst={burst} equivalence={equivalence} />
        }
      />

      {!isLoading && !cameraError && (
        <div className="flex flex-col items-center gap-2.5">
          <div className="flex items-center justify-center gap-2">
            {isWarmingUp ? (
              <Badge variant="outline" className="gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Getting camera ready…
              </Badge>
            ) : submitting ? (
              <Badge variant="outline" className="gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Recording attendance…
              </Badge>
            ) : verdict ? (
              <Badge variant="destructive">Could not match — try again</Badge>
            ) : captureFailed ? (
              <Badge variant="outline">Capture failed</Badge>
            ) : (
              <Badge variant="outline">Looking for face…</Badge>
            )}
          </div>
          <div className="flex flex-col items-center gap-2">
            {canTryAgain && (verdict || captureFailed || phase === "paused") && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetry}
                disabled={submitting || (verdict !== null && attempts >= maxAttempts)}
              >
                <RefreshCw data-icon="inline-start" />
                Try again
              </Button>
            )}
            {verdict && (
              <p className="text-xs text-muted-foreground">
                Attempt {attempts} of {maxAttempts}
              </p>
            )}
            {showOtp && (
              <Button
                size="sm"
                variant={attempts >= 2 || captureFailed ? "default" : "outline"}
                onClick={onUseOtp}
                disabled={submitting}
              >
                <KeyRound data-icon="inline-start" />
                Use OTP
              </Button>
            )}
            {verdict && attempts >= maxAttempts && (
              <p className="text-center text-xs text-muted-foreground">
                Too many failed face attempts. Use OTP to check in.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">{verifyLabel}</p>
    </CardContent>
  )
}
