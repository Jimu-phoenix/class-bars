import { useEffect, useRef } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { useFaceDetection } from "@/hooks/useFaceDetection"
import { euclideanDistance, isMatch } from "@/lib/faceCompare"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"
import FaceCaptureFrame from "@/components/face/FaceCaptureFrame"

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
}) {
  const {
    videoRef,
    canvasRef,
    isLoading,
    error: cameraError,
    recognitionReady,
    results,
  } = useFaceDetection()

  const liveFace =
    recognitionReady && results.length > 0
      ? results[0].detection.descriptor
      : null

  const capturedRef = useRef(false)

  useEffect(() => {
    if (verdict !== null) return
    if (!stored || !liveFace) return
    if (capturedRef.current) return
    capturedRef.current = true
    if (isMatch(stored, liveFace)) {
      onMatch(liveFace)
    } else {
      onNoMatch(euclideanDistance(stored, liveFace))
    }
  }, [liveFace, stored, verdict, onMatch, onNoMatch])

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
            ) : (
              <Badge variant="outline">Looking for face…</Badge>
            )}
          </div>
          {verdict && (
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