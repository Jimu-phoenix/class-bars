import { useState } from "react"
import { CheckCircle2, Loader2, Save } from "lucide-react"
import { useFaceDetection } from "@/hooks/useFaceDetection"
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
    canvasRef,
    isLoading,
    error: cameraError,
    recognitionReady,
    results,
    debugData,
  } = useFaceDetection()

  const [frozenFace, setFrozenFace] = useState<Float32Array | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const liveFace =
    recognitionReady && results.length > 0
      ? results[0].detection.descriptor
      : null
  if (liveFace && !frozenFace) {
    setFrozenFace(liveFace)
  }
  const face = frozenFace ?? liveFace
  const descriptorReady = face !== null && face.length === 128

  const handleSave = async () => {
    if (!face) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await onSave(face)
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
      <div className="flex flex-col gap-2">
        <FaceCaptureFrame
          videoRef={videoRef}
          canvasRef={canvasRef}
          isLoading={isLoading}
          error={cameraError}
          debugReadout={<FaceDebugReadout data={debugData} />}
        />
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
        {onCancel && (
          <Button variant="outline" size="lg" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </CardContent>
  )
}