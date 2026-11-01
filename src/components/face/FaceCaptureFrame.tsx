import type { ReactNode, RefObject } from "react"
import { Loader2 } from "lucide-react"
import { isModelError } from "@/lib/faceModels"
import { FACE_MODEL_VERSION } from "@/lib/faceCompare"
import {
  isFaceDebugEnabled,
  USE_TINY_LANDMARKS,
  ENROL_DETECTOR,
  VERIFY_INPUT_SIZE,
} from "@/lib/faceCapture"
import type { BurstResult, DescriptorEquivalence } from "@/lib/faceBurst"

export function FaceDebugReadout({
  burst,
  equivalence,
}: {
  burst?: BurstResult | null
  equivalence?: DescriptorEquivalence | null
}) {
  if (!isFaceDebugEnabled()) return null

  const lastAttempt = burst?.attempts[burst.attempts.length - 1]
  const trackInfo = burst?.trackSettings
    ? `${burst.trackSettings.width ?? "?"}×${burst.trackSettings.height ?? "?"}${
        burst.trackSettings.frameRate
          ? ` @ ${Math.round(burst.trackSettings.frameRate)}fps`
          : ""
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
          <span className="font-medium text-foreground">Frame:</span>{" "}
          {burst ? `${burst.videoWidth}×${burst.videoHeight}` : "—"}
        </div>
        <div>
          <span className="font-medium text-foreground">Track:</span> {trackInfo}
        </div>
        <div>
          <span className="font-medium text-foreground">Burst:</span>{" "}
          {burst ? `${burst.framesAccepted}/${burst.framesTried} accepted` : "—"}
        </div>
        <div>
          <span className="font-medium text-foreground">Elapsed:</span>{" "}
          {burst ? `${burst.elapsedMs} ms` : "—"}
        </div>
        <div>
          <span className="font-medium text-foreground">Score:</span>{" "}
          {lastAttempt?.score !== null && lastAttempt?.score !== undefined
            ? lastAttempt.score.toFixed(3)
            : "—"}
        </div>
        <div>
          <span className="font-medium text-foreground">Face box:</span>{" "}
          {lastAttempt?.faceFraction !== null && lastAttempt?.faceFraction !== undefined
            ? `${(lastAttempt.faceFraction * 100).toFixed(1)}%`
            : "—"}
        </div>
        <div>
          <span className="font-medium text-foreground">Pose:</span>{" "}
          {lastAttempt?.yawDeg !== null && lastAttempt?.yawDeg !== undefined
            ? `${lastAttempt.yawDeg.toFixed(1)}° yaw`
            : "—"}{" "}
          {lastAttempt?.rollDeg !== null && lastAttempt?.rollDeg !== undefined
            ? `${lastAttempt.rollDeg.toFixed(1)}° roll`
            : ""}
        </div>
        <div>
          <span className="font-medium text-foreground">Sharpness:</span>{" "}
          {lastAttempt?.sharpness !== null && lastAttempt?.sharpness !== undefined
            ? lastAttempt.sharpness.toFixed(0)
            : "—"}
        </div>
        <div>
          <span className="font-medium text-foreground">Brightness:</span>{" "}
          {lastAttempt?.brightness !== null && lastAttempt?.brightness !== undefined
            ? lastAttempt.brightness.toFixed(0)
            : "—"}
        </div>
        <div>
          <span className="font-medium text-foreground">Descriptor check:</span>{" "}
          {equivalence ? "complete" : "—"}
        </div>
      </div>
      {burst && !burst.ok ? (
        <div className="mt-1.5 border-t border-border/50 pt-1 text-destructive">
          Reasons: {burst.reason}
        </div>
      ) : null}
      {lastAttempt && lastAttempt.reasons.length > 0 ? (
        <div className="mt-1 text-[10px]">
          Last attempt reasons: {lastAttempt.reasons.join(", ")}
        </div>
      ) : null}
    </div>
  )
}

export default function FaceCaptureFrame({
  videoRef,
  isLoading,
  error,
  status,
  debugReadout,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  isLoading: boolean
  error: string | null
  status?: string | null
  debugReadout?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-md border bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="block w-full" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[68%] w-[46%] rounded-[50%] border-2 border-dashed border-white/70" />
        </div>
        {status && !isLoading && !error ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-3 pt-8">
            <p aria-live="polite" className="text-center text-sm text-white">
              {status}
            </p>
          </div>
        ) : null}
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
