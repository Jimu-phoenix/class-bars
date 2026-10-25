import { Loader2 } from "lucide-react"
import { isModelError } from "@/lib/faceModels"
import { FACE_MODEL_VERSION } from "@/lib/faceCompare"
import {
  isFaceDebugEnabled,
  type DistanceSummary,
  type FaceDebugData,
  USE_TINY_LANDMARKS,
  ENROL_DETECTOR,
  VERIFY_INPUT_SIZE,
} from "@/lib/faceCapture"

export function FaceDebugReadout({
  data,
  lastDistance,
  distanceSummary,
}: {
  data?: FaceDebugData | null
  lastDistance?: number | null
  distanceSummary?: DistanceSummary | null
}) {
  if (!isFaceDebugEnabled() || !data) return null

  const trackInfo = data.trackSettings
    ? `${data.trackSettings.width ?? "?"}×${data.trackSettings.height ?? "?"}${
        data.trackSettings.frameRate ? ` @ ${Math.round(data.trackSettings.frameRate)}fps` : ""
      }`
    : "—"

  return (
    <div
      role="region"
      aria-label="Face debug readout"
      className="rounded border border-border bg-muted/60 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground"
    >
      <div className="font-semibold uppercase tracking-wider text-foreground">
        Debug Readout (?facedebug=1)
      </div>
      <div className="mt-1 border-b border-border/50 pb-1 text-[10px]">
        <div>
          <span className="font-medium text-foreground">Configuration:</span>{" "}
          landmarks={USE_TINY_LANDMARKS ? "tiny" : "full (68)"} · enrol={ENROL_DETECTOR} · verifySize={VERIFY_INPUT_SIZE} · {FACE_MODEL_VERSION}
        </div>
      </div>
      <div className="mt-1 grid grid-cols-1 gap-0.5 sm:grid-cols-2">
        <div>
          <span className="font-medium text-foreground">Frame:</span> {data.videoWidth}×{data.videoHeight}
        </div>
        <div>
          <span className="font-medium text-foreground">Track:</span> {trackInfo}
        </div>
        <div>
          <span className="font-medium text-foreground">Score:</span>{" "}
          {data.score !== null ? data.score.toFixed(3) : "—"}
        </div>
        <div>
          <span className="font-medium text-foreground">Face box:</span>{" "}
          {data.boxWidthPx !== null ? `${data.boxWidthPx}px` : "—"}{" "}
          {data.boxWidthPercent !== null ? `(${data.boxWidthPercent}%)` : ""}
        </div>
      </div>
      {distanceSummary ? (
        <div className="mt-1.5 border-t border-border/50 pt-1">
          <div>
            <span className="font-medium text-foreground">Last distance:</span>{" "}
            {lastDistance !== undefined && lastDistance !== null
              ? lastDistance.toFixed(4)
              : "—"}
          </div>
          <div>
            <span className="font-medium text-foreground">Session stats:</span>{" "}
            {distanceSummary.attempts} attempt{distanceSummary.attempts === 1 ? "" : "s"} · min{" "}
            {distanceSummary.min !== null ? distanceSummary.min.toFixed(4) : "—"} · med{" "}
            {distanceSummary.median !== null ? distanceSummary.median.toFixed(4) : "—"} · max{" "}
            {distanceSummary.max !== null ? distanceSummary.max.toFixed(4) : "—"}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function FaceCaptureFrame({
  videoRef,
  canvasRef,
  isLoading,
  error,
  debugReadout,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  isLoading: boolean
  error: string | null
  debugReadout?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-md border bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="block w-full" />
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        {(isLoading || error) && (
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
                <p className="font-medium">
                  {isModelError(error) ? "Face models unavailable" : "Camera unavailable"}
                </p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </>
            )}
          </div>
        )}
      </div>
      {debugReadout}
    </div>
  )
}