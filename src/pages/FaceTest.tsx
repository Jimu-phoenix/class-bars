import { Link } from "react-router-dom"
import { RefreshCw } from "lucide-react"
import { useFaceDetection } from "@/hooks/useFaceDetection"
import { captureStatusMessage } from "@/lib/faceCapture"
import FaceCaptureFrame, { FaceDebugReadout } from "@/components/face/FaceCaptureFrame"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { FaceModelsStatus } from "@/lib/faceModels"

function ModelsStatus({ models }: { models: FaceModelsStatus }) {
  const entries: { key: keyof FaceModelsStatus; label: string }[] = [
    { key: "detector", label: "Detector (TinyFaceDetector)" },
    { key: "landmarks", label: "Landmarks (68-point tiny)" },
    { key: "recognition", label: "Recognition (128-d)" },
  ]

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Models</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {entries.map(({ key, label }) => (
          <div
            key={key}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="text-muted-foreground">{label}</span>
            <Badge variant={models[key] ? "default" : "destructive"}>
              {models[key] ? "Loaded" : "Missing"}
            </Badge>
          </div>
        ))}
        <p className="mt-1 text-xs text-muted-foreground">
          Files load from <code className="font-mono">/models</code> on first
          use. If any are Missing, check the browser console for fetch errors.
        </p>
      </CardContent>
    </Card>
  )
}

export default function FaceTest() {
  const {
    videoRef,
    isLoading,
    error,
    burst,
    equivalence,
    models,
    phase,
    isWarmingUp,
    retry,
  } = useFaceDetection({ mode: "enrol" })

  const status = (() => {
    if (isLoading || error) return null
    if (isWarmingUp) return "Getting camera ready…"
    if (phase === "starting") return "Starting camera…"
    if (phase === "capturing") return "Capturing a clear frame…"
    if (phase === "paused") return "Camera paused. Try again to resume."
    if (burst?.ok) return "Burst captured."
    if (burst && !burst.ok) return captureStatusMessage(burst.reason)
    return "Position your face in the oval."
  })()

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 md:p-8">
      <header className="flex items-center justify-between">
        <div>
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Back to Home
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-foreground">
            Face Burst Test
          </h1>
          <p className="text-sm text-muted-foreground">
            Diagnostic page — quality-gated burst capture and descriptor equivalence
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex flex-col gap-3 lg:w-1/2">
          <FaceCaptureFrame
            videoRef={videoRef}
            isLoading={isLoading}
            error={error}
            status={status}
            debugReadout={
              <FaceDebugReadout burst={burst} equivalence={equivalence} />
            }
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={retry}
              disabled={isLoading || phase === "capturing" || phase === "starting"}
            >
              <RefreshCw data-icon="inline-start" />
              New burst
            </Button>
            {burst && (
              <Badge variant={burst.ok ? "default" : "outline"}>
                {burst.ok ? "Captured" : burst.reason}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:w-1/2">
          <ModelsStatus models={models} />
          <Card size="sm">
            <CardHeader>
              <CardTitle>Burst result</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground">
                {JSON.stringify(
                  burst
                    ? {
                        ok: burst.ok,
                        reason: burst.ok ? null : burst.reason,
                        framesTried: burst.framesTried,
                        framesAccepted: burst.framesAccepted,
                        elapsedMs: burst.elapsedMs,
                        videoWidth: burst.videoWidth,
                        videoHeight: burst.videoHeight,
                        trackSettings: burst.trackSettings,
                      }
                    : null,
                  null,
                  2,
                )}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
