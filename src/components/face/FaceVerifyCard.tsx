import { useEffect, useRef, useState } from "react"
import { KeyRound, Loader2, RefreshCw } from "lucide-react"
import { useFaceDetection } from "@/hooks/useFaceDetection"
import { euclideanDistance, isMatch } from "@/lib/faceCompare"
import {
  recordSessionDistance,
  getSessionDistances,
  summariseDistances,
  type DistanceSummary,
} from "@/lib/faceCapture"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"
import FaceCaptureFrame, { FaceDebugReadout } from "@/components/face/FaceCaptureFrame"

export type VerifyVerdict = { status: "no-match"; distance: number } | null

export default function FaceVerifyCard({
  verifyLabel,
  stored,
  submitting,
  error,
  verdict,
  onMatch,
  onNoMatch,
  onRetry,
  onCancel,
  onUseOtp,
  maxAttempts = 3,
}: {
  verifyLabel: string
  stored: Float32Array
  submitting: boolean
  error: string
  verdict: VerifyVerdict
  onMatch: (descriptor: Float32Array) => void
  onNoMatch: (distance: number) => void
  onRetry: () => void
  onCancel: () => void
  onUseOtp?: () => void
  maxAttempts?: number
}) {
  const {
    videoRef,
    canvasRef,
    isLoading,
    error: cameraError,
    recognitionReady,
    results,
    debugData,
    isWarmingUp,
  } = useFaceDetection()

  const [lastDistance, setLastDistance] = useState<number | null>(null)
  const [distanceSummary, setDistanceSummary] = useState<DistanceSummary>(() =>
    summariseDistances(getSessionDistances()),
  )
  const [attempts, setAttempts] = useState(0)

  const liveFace =
    recognitionReady && results.length > 0
      ? results[0].detection.descriptor
      : null

  const capturedRef = useRef(false)

  useEffect(() => {
    setAttempts(0)
    capturedRef.current = false
  }, [stored])

  useEffect(() => {
    if (isWarmingUp || verdict !== null) return
    if (!stored || !liveFace) return
    if (capturedRef.current) return
    capturedRef.current = true
    const distance = euclideanDistance(stored, liveFace)
    recordSessionDistance(distance)
    setLastDistance(distance)
    setDistanceSummary(summariseDistances(getSessionDistances()))
    if (isMatch(stored, liveFace)) {
      onMatch(liveFace)
    } else {
      setAttempts((prev) => prev + 1)
      onNoMatch(distance)
    }
  }, [liveFace, stored, verdict, isWarmingUp, onMatch, onNoMatch])

  useEffect(() => {
    if (verdict === null) {
      capturedRef.current = false
    }
  }, [verdict])

  return (
    <CardContent className="flex flex-col gap-5">
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <FaceCaptureFrame
        videoRef={videoRef}
        canvasRef={canvasRef}
        isLoading={isLoading}
        error={cameraError}
        debugReadout={
          <FaceDebugReadout
            data={debugData}
            lastDistance={lastDistance}
            distanceSummary={distanceSummary}
          />
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
              <>
                <Badge variant="destructive">NO MATCH</Badge>
                <Badge variant="outline" className="font-mono text-xs">
                  distance {verdict.distance.toFixed(4)}
                </Badge>
              </>
            ) : (
              <Badge variant="outline">Looking for face…</Badge>
            )}
          </div>
          <div className="flex flex-col items-center gap-2">
            {!verdict && !isWarmingUp && !submitting && (
              <Button
                size="sm"
                variant="outline"
                onClick={onRetry}
                disabled={submitting}
              >
                <RefreshCw data-icon="inline-start" />
                Try again
              </Button>
            )}
            {verdict && (
              <>
                <p className="text-xs text-muted-foreground">
                  Attempt {attempts} of {maxAttempts}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onRetry}
                    disabled={submitting || attempts >= maxAttempts}
                  >
                    <RefreshCw data-icon="inline-start" />
                    Try again
                  </Button>
                  {(onUseOtp && (attempts >= maxAttempts || attempts >= 2)) && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={onUseOtp}
                      disabled={submitting}
                    >
                      <KeyRound data-icon="inline-start" />
                      Use OTP
                    </Button>
                  )}
                  {onUseOtp && attempts < maxAttempts && attempts < 2 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onUseOtp}
                      disabled={submitting}
                    >
                      <KeyRound data-icon="inline-start" />
                      Use OTP
                    </Button>
                  )}
                </div>
                {attempts >= maxAttempts && (
                  <p className="text-center text-xs text-muted-foreground">
                    Too many failed attempts. Use OTP to check in.
                  </p>
                )}
              </>
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