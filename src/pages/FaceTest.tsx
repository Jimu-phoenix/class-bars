import { useFaceDetection } from "@/hooks/useFaceDetection"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Link } from "react-router-dom"
import type { FaceModelsStatus } from "@/lib/faceModels"

function formatDescriptor(desc: Float32Array): string {
  const values = Array.from(desc.slice(0, 10))
    .map((v) => v.toFixed(4))
    .join(", ")
  return `[${values}, ...] (128-d total)`
}

function LoadingDetectors() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-lg font-medium text-foreground">
        Loading detectors...
      </p>
    </div>
  )
}

function CameraErrorState({ error }: { error: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <div className="rounded-full bg-destructive/10 p-3">
        <svg
          className="h-6 w-6 text-destructive"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <p className="text-lg font-medium text-foreground">Camera Error</p>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        {error.includes("Permission")
          ? "Camera access was denied. Please allow camera access in your browser settings and reload."
          : error}
      </p>
    </div>
  )
}

function NoFaceDetected() {
  return (
    <Card size="sm">
      <CardContent className="py-4">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/50" />
          <span className="text-sm text-muted-foreground">
            No face detected
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </div>
  )
}

function ModelsStatus({
  models,
}: {
  models: FaceModelsStatus
}) {
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

function DetectionPanel({
  result,
  faceCount,
}: {
  result: NonNullable<ReturnType<typeof useFaceDetection>["results"]>[number]
  faceCount: number
}) {
  const d = result.detection

  return (
    <div className="flex flex-col gap-3">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Detection Status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant={faceCount > 0 ? "default" : "secondary"}>
            {faceCount === 0
              ? "No face"
              : faceCount === 1
                ? "1 face"
                : `${faceCount} faces`}
          </Badge>
          <Badge variant="outline">
            {(d.confidence * 100).toFixed(1)}% confidence
          </Badge>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Bounding Box</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          <ParamRow label="x" value={d.box.x.toFixed(1)} />
          <ParamRow label="y" value={d.box.y.toFixed(1)} />
          <ParamRow label="width" value={d.box.width.toFixed(1)} />
          <ParamRow label="height" value={d.box.height.toFixed(1)} />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Landmarks</CardTitle>
        </CardHeader>
        <CardContent>
          <ParamRow
            label="68-point count"
            value={String(d.landmarksCount)}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Face Descriptor</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="break-all font-mono text-xs text-foreground">
            {formatDescriptor(d.descriptor)}
          </p>
        </CardContent>
      </Card>

    </div>
  )
}

export default function FaceTest() {
  const {
    videoRef,
    canvasRef,
    results,
    faceCount,
    isLoading,
    error,
    models,
  } = useFaceDetection()

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
            Face Detection Test
          </h1>
          <p className="text-sm text-muted-foreground">
            Diagnostic page — face-api.js TinyFaceDetector
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted lg:w-1/2">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <LoadingDetectors />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <CameraErrorState error={error} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6 lg:w-1/2">
          <ModelsStatus models={models} />
          {error ? null : isLoading ? null : faceCount === 0 ? (
            <NoFaceDetected />
          ) : (
            results.map((r, i) => (
              <DetectionPanel key={i} result={r} faceCount={faceCount} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
