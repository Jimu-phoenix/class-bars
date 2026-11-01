import * as faceapi from "face-api.js"
import {
  DETECTION_OPTIONS,
  SSD_DETECTION_OPTIONS,
  VERIFY_DETECTION_OPTIONS,
} from "@/lib/faceModels"
import {
  CAPTURE_FRAME_COUNT,
  CAPTURE_TIMEOUT_MS,
  USE_TINY_LANDMARKS,
  nextCaptureIntervalMs,
  type CaptureFailureReason,
} from "@/lib/faceCapture"
import {
  DEFAULT_QUALITY_CONFIG,
  evaluateFrameQuality,
  type Box,
  type Point,
} from "@/lib/faceQuality"
import {
  averageDescriptors,
  euclideanDistance,
  isValidDescriptor,
  medianDistance,
} from "@/lib/faceCompare"

export type BurstMode = "verify" | "enrol"

export type BurstAttempt = {
  attempt: number
  elapsedMs: number
  score: number | null
  faceCount: number
  faceFraction: number | null
  yawDeg: number | null
  rollDeg: number | null
  sharpness: number | null
  brightness: number | null
  distance: number | null
  accepted: boolean
  reasons: CaptureFailureReason[]
}

export type TrackSettings = {
  width?: number
  height?: number
  frameRate?: number
}

type BurstBase = {
  mode: BurstMode
  attempts: BurstAttempt[]
  framesTried: number
  framesAccepted: number
  elapsedMs: number
  videoWidth: number
  videoHeight: number
  trackSettings?: TrackSettings
}

export type BurstSuccess = BurstBase & {
  ok: true
  descriptor: Float32Array
  descriptors: Float32Array[]
  combinedDistance: number | null
}

export type BurstFailure = BurstBase & {
  ok: false
  reason: CaptureFailureReason
}

export type BurstResult = BurstSuccess | BurstFailure

export type DescriptorEquivalence = {
  distance: number
  videoDescriptor: Float32Array
  canvasDescriptor: Float32Array
}

type RawDetection = {
  detection: {
    score: number
    box: Box
  }
  landmarks?: {
    positions: Point[]
  }
  descriptor?: Float32Array
}

type CaptureOptions = {
  video: HTMLVideoElement
  mode: BurstMode
  useSsd?: boolean
  referenceDescriptor?: Float32Array | null
  signal?: AbortSignal
}

function hasVideoFrame(video: HTMLVideoElement): boolean {
  return (
    video.readyState >= 2 &&
    !video.paused &&
    !video.ended &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  )
}

function getTrackSettings(video: HTMLVideoElement): TrackSettings | undefined {
  const stream = video.srcObject
  if (!(stream instanceof MediaStream)) return undefined
  const track = stream.getVideoTracks()[0]
  const settings = track?.getSettings()
  if (!settings) return undefined
  return {
    width: settings.width,
    height: settings.height,
    frameRate: settings.frameRate,
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false)
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      cleanup()
      resolve(true)
    }, ms)
    const onAbort = () => {
      cleanup()
      resolve(false)
    }
    const cleanup = () => {
      window.clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function detectionOptions(mode: BurstMode, useSsd: boolean) {
  if (mode === "enrol") {
    return useSsd ? SSD_DETECTION_OPTIONS : DETECTION_OPTIONS
  }
  return VERIFY_DETECTION_OPTIONS
}

function firstFailureReason(attempts: BurstAttempt[]): CaptureFailureReason {
  const last = attempts[attempts.length - 1]
  return last?.reasons[0] ?? "timeout"
}

function logAttempt(attempt: BurstAttempt, framesAccepted: number, startedAt: number) {
  if (!import.meta.env.DEV) return
  console.debug("[face-burst] attempt", {
    attempt: attempt.attempt,
    score: attempt.score,
    faceCount: attempt.faceCount,
    faceFraction: attempt.faceFraction,
    yawDeg: attempt.yawDeg,
    rollDeg: attempt.rollDeg,
    sharpness: attempt.sharpness,
    brightness: attempt.brightness,
    distance: attempt.distance,
    accepted: attempt.accepted,
    reasons: attempt.reasons,
    framesAccepted,
    elapsedMs: Math.round(performance.now() - startedAt),
  })
}

export async function captureFaceBurst({
  video,
  mode,
  useSsd = false,
  referenceDescriptor = null,
  signal,
}: CaptureOptions): Promise<BurstResult> {
  const videoWidth = video.videoWidth
  const videoHeight = video.videoHeight
  const trackSettings = getTrackSettings(video)
  const startedAt = performance.now()
  const attempts: BurstAttempt[] = []
  const accepted: Float32Array[] = []

  const base = (): BurstBase => ({
    mode,
    attempts,
    framesTried: attempts.length,
    framesAccepted: accepted.length,
    elapsedMs: Math.round(performance.now() - startedAt),
    videoWidth,
    videoHeight,
    trackSettings,
  })

  if (videoWidth <= 0 || videoHeight <= 0) {
    return { ok: false, reason: "camera_error", ...base() }
  }

  const canvas = document.createElement("canvas")
  canvas.width = videoWidth
  canvas.height = videoHeight
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) {
    return { ok: false, reason: "camera_error", ...base() }
  }

  const options = detectionOptions(mode, useSsd)
  const referenceIsValid =
    referenceDescriptor !== null && isValidDescriptor(referenceDescriptor)
  let lastAttemptStartedAt = 0

  while (accepted.length < CAPTURE_FRAME_COUNT) {
    if (signal?.aborted) {
      return { ok: false, reason: "cancelled", ...base() }
    }
    if (performance.now() - startedAt >= CAPTURE_TIMEOUT_MS) {
      return { ok: false, reason: firstFailureReason(attempts), ...base() }
    }
    if (!hasVideoFrame(video)) {
      if (!(await sleep(100, signal))) {
        return { ok: false, reason: "cancelled", ...base() }
      }
      continue
    }

    const interval = nextCaptureIntervalMs()
    const waitMs = lastAttemptStartedAt + interval - performance.now()
    if (waitMs > 0) {
      if (!(await sleep(waitMs, signal))) {
        return { ok: false, reason: "cancelled", ...base() }
      }
      continue
    }

    const attemptStartedAt = performance.now()
    lastAttemptStartedAt = attemptStartedAt

    ctx.drawImage(video, 0, 0, videoWidth, videoHeight)

    let detections: RawDetection[]
    try {
      detections = (await faceapi
        .detectAllFaces(canvas, options)
        .withFaceLandmarks(USE_TINY_LANDMARKS)
        .withFaceDescriptors()) as unknown as RawDetection[]
    } catch (err) {
      if (signal?.aborted) {
        return { ok: false, reason: "cancelled", ...base() }
      }
      console.error("face-api burst detection error:", err)
      const attempt: BurstAttempt = {
        attempt: attempts.length + 1,
        elapsedMs: Math.round(performance.now() - attemptStartedAt),
        score: null,
        faceCount: 0,
        faceFraction: null,
        yawDeg: null,
        rollDeg: null,
        sharpness: null,
        brightness: null,
        distance: null,
        accepted: false,
        reasons: ["camera_error"],
      }
      attempts.push(attempt)
      logAttempt(attempt, accepted.length, startedAt)
      continue
    }

    let image: ImageData
    try {
      image = ctx.getImageData(0, 0, videoWidth, videoHeight)
    } catch (err) {
      console.error("face-api burst frame read error:", err)
      const attempt: BurstAttempt = {
        attempt: attempts.length + 1,
        elapsedMs: Math.round(performance.now() - attemptStartedAt),
        score: null,
        faceCount: detections.length,
        faceFraction: null,
        yawDeg: null,
        rollDeg: null,
        sharpness: null,
        brightness: null,
        distance: null,
        accepted: false,
        reasons: ["camera_error"],
      }
      attempts.push(attempt)
      logAttempt(attempt, accepted.length, startedAt)
      continue
    }

    const first = detections[0]
    const quality = evaluateFrameQuality(
      {
        score: first?.detection.score ?? null,
        faceCount: detections.length,
        box: first?.detection.box ?? null,
        landmarks: first?.landmarks?.positions ?? null,
        image,
        frameWidth: videoWidth,
        frameHeight: videoHeight,
      },
      DEFAULT_QUALITY_CONFIG,
    )

    const reasons = [...quality.reasons]
    let descriptor = detections.length === 1 ? (first?.descriptor ?? null) : null
    if (detections.length === 1 && !isValidDescriptor(descriptor)) {
      reasons.push("invalid_descriptor")
      descriptor = null
    }

    const distance =
      descriptor && referenceIsValid && referenceDescriptor
        ? euclideanDistance(referenceDescriptor, descriptor)
        : null
    const acceptedFrame = reasons.length === 0 && descriptor !== null

    const attempt: BurstAttempt = {
      attempt: attempts.length + 1,
      elapsedMs: Math.round(performance.now() - attemptStartedAt),
      score: quality.score,
      faceCount: quality.faceCount,
      faceFraction: quality.faceFraction,
      yawDeg: quality.yawDeg,
      rollDeg: quality.rollDeg,
      sharpness: quality.sharpness,
      brightness: quality.brightness,
      distance,
      accepted: acceptedFrame,
      reasons,
    }
    attempts.push(attempt)
    logAttempt(attempt, accepted.length + (acceptedFrame ? 1 : 0), startedAt)

    if (acceptedFrame && descriptor) {
      accepted.push(descriptor)
    }
  }

  const combined =
    referenceIsValid && referenceDescriptor
      ? medianDistance(referenceDescriptor, accepted)
      : null
  const descriptor = combined?.descriptor ?? averageDescriptors(accepted)
  if (!descriptor) {
    return { ok: false, reason: "invalid_descriptor", ...base() }
  }

  const result: BurstSuccess = {
    ok: true,
    descriptor,
    descriptors: accepted,
    combinedDistance: combined?.distance ?? null,
    ...base(),
  }
  if (import.meta.env.DEV) {
    console.debug("[face-burst] complete", {
      mode,
      framesTried: result.framesTried,
      framesAccepted: result.framesAccepted,
      elapsedMs: result.elapsedMs,
      combinedDistance: result.combinedDistance,
    })
  }
  return result
}

export async function checkVideoCanvasDescriptorEquivalence(
  video: HTMLVideoElement,
  mode: BurstMode,
  useSsd = false,
): Promise<DescriptorEquivalence | null> {
  if (!import.meta.env.DEV || !hasVideoFrame(video)) return null

  const videoWidth = video.videoWidth
  const videoHeight = video.videoHeight
  const canvas = document.createElement("canvas")
  canvas.width = videoWidth
  canvas.height = videoHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  const wasPaused = video.paused
  if (!wasPaused) video.pause()
  try {
    await sleep(80)
    ctx.drawImage(video, 0, 0, videoWidth, videoHeight)
    const options = detectionOptions(mode, useSsd)
    const videoDetections = (await faceapi
      .detectAllFaces(video, options)
      .withFaceLandmarks(USE_TINY_LANDMARKS)
      .withFaceDescriptors()) as unknown as RawDetection[]
    const canvasDetections = (await faceapi
      .detectAllFaces(canvas, options)
      .withFaceLandmarks(USE_TINY_LANDMARKS)
      .withFaceDescriptors()) as unknown as RawDetection[]

    const videoDescriptor = videoDetections[0]?.descriptor
    const canvasDescriptor = canvasDetections[0]?.descriptor
    if (
      videoDetections.length !== 1 ||
      canvasDetections.length !== 1 ||
      !isValidDescriptor(videoDescriptor) ||
      !isValidDescriptor(canvasDescriptor)
    ) {
      return null
    }

    return {
      distance: euclideanDistance(videoDescriptor, canvasDescriptor),
      videoDescriptor,
      canvasDescriptor,
    }
  } catch (err) {
    console.error("face-api descriptor equivalence check failed:", err)
    return null
  } finally {
    if (!wasPaused) {
      await video.play().catch(() => {})
    }
  }
}
