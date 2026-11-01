import { useState } from "react"
import { CheckCircle2, Loader2, RefreshCw, Save } from "lucide-react"
import { useFaceDetection } from "@/hooks/useFaceDetection"
import { isValidDescriptor } from "@/lib/faceCompare"
import { captureStatusMessage } from "@/lib/faceCapture"
import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"
import FaceCaptureFrame, { FaceDebugReadout } from "@/components/face/FaceCaptureFrame"

export default function FaceEnrollCard({
  actionLabel = "Save face",
  onSave,
  onCancel,
}: {
  actionLabel?: string
  onSave: (descriptor: Float32Array) => Promise<void>
  onCancel?: () => void
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
  } = useFaceDetection({ mode: "enrol" })

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const descriptor = burst?.ok ? burst.descriptor : null
  const descriptorReady = isValidDescriptor(descriptor)
  const canRetry =
    !isLoading &&
    !cameraError &&
    !busy &&
    (phase === "failed" || phase === "paused")

  const status = (() => {
    if (isLoading || cameraError) return null
    if (isWarmingUp) return "Getting camera ready…"
    if (phase === "starting") return "Starting camera…"
    if (phase === "capturing") return "Capturing a clear frame…"
    if (phase === "paused") return "Camera paused. Try again to resume."
    if (burst?.ok) return "Face captured. You can save it now."
    if (burst && !burst.ok) return captureStatusMessage(burst.reason)
    return "Position your face in the oval."
  })()

  const handleSave = async () => {
    if (!isValidDescriptor(descriptor)) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await onSave(descriptor)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save face")
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardContent className="flex flex-col gap-5">
      {(error || saved) && (
        <div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {saved && (
            <p className="flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-300">
              <CheckCircle2 className="h-4 w-4" />
              Face saved.
            </p>
          )}
        </div>
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
      <div className="flex gap-3">
        <Button
          className="flex-1"
          size="lg"
          onClick={() => void handleSave()}
          disabled={busy || !descriptorReady}
        >
          {busy ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <Save data-icon="inline-start" aria-hidden="true" />
          )}
          {actionLabel}
        </Button>
        {canRetry && (
          <Button
            variant="outline"
            size="lg"
            onClick={retry}
            disabled={busy}
          >
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            Try again
          </Button>
        )}
        {onCancel && (
          <Button variant="outline" size="lg" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </CardContent>
  )
}
