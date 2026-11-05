// Pure helpers and constants for the face capture pipeline.
// This file has zero browser/face-api dependencies so it can be tested directly with node:test.

export const DETECTOR_INPUT_SIZE = 320
export const VERIFY_INPUT_SIZE = 416
export const DETECTOR_SCORE_THRESHOLD = 0.4
// Landmark model: false uses full 68-point net; true uses tiny net.
export const USE_TINY_LANDMARKS = false

export const SSD_MIN_CONFIDENCE = 0.6
export type EnrolDetectorType = "ssd" | "tiny"
export const ENROL_DETECTOR: EnrolDetectorType = "ssd"

export const CAPTURE_FRAME_COUNT = 3
export const CAPTURE_MIN_INTERVAL_MS = 250
export const CAPTURE_MAX_INTERVAL_MS = 400
export const CAPTURE_TIMEOUT_MS = 10_000
export const CAPTURE_INACTIVITY_STOP_MS = 60_000
// CAPTURE_* values are PROVISIONAL and need on-device calibration.
export const QUALITY_MIN_DETECTION_SCORE = 0.6
export const QUALITY_MIN_FACE_FRACTION = 0.25
export const QUALITY_MAX_POSE_DEG = 20
export const QUALITY_MIN_SHARPNESS = 100
export const QUALITY_BRIGHTNESS_MIN = 50
export const QUALITY_BRIGHTNESS_MAX = 210
export const QUALITY_SAMPLE_STEP = 2

export const CAMERA_IDEAL_WIDTH = 1280
export const CAMERA_IDEAL_HEIGHT = 720
export const ENABLE_CAMERA_CONSTRAINTS = true

export const WARMUP_MS = 800
export const ENABLE_CAMERA_WARMUP = true

export type CaptureFailureReason =
  | "no_face"
  | "multiple_faces"
  | "low_score"
  | "face_too_small"
  | "landmarks_missing"
  | "pose"
  | "blurry"
  | "too_dark"
  | "too_bright"
  | "invalid_descriptor"
  | "timeout"
  | "camera_error"
  | "model_error"
  | "cancelled"

export function nextCaptureIntervalMs(
  minMs: number = CAPTURE_MIN_INTERVAL_MS,
  maxMs: number = CAPTURE_MAX_INTERVAL_MS,
  random: () => number = Math.random,
): number {
  if (maxMs <= minMs) return minMs
  return Math.round(minMs + random() * (maxMs - minMs))
}

export function captureStatusMessage(
  reason: CaptureFailureReason | null,
  fallback = "Position your face in the oval.",
): string {
  switch (reason) {
    case "no_face":
      return "No face detected. Center your face in the oval."
    case "multiple_faces":
      return "Multiple faces detected. Only one person should be in view."
    case "low_score":
      return "Face not clear enough. Face the camera and improve the lighting."
    case "face_too_small":
      return "Move closer to the camera."
    case "landmarks_missing":
      return "Could not read your facial landmarks. Hold still and face the camera."
    case "pose":
      return "Face the camera straight on."
    case "blurry":
      return "The image is blurry. Hold still and try again."
    case "too_dark":
      return "Too dark. Find better lighting."
    case "too_bright":
      return "Too bright. Reduce glare or move away from the light."
    case "invalid_descriptor":
      return "Could not create a valid face template. Try again."
    case "timeout":
      return "Could not capture a clear face in time. Try again."
    case "camera_error":
      return "Camera unavailable."
    case "model_error":
      return "Face models unavailable."
    case "cancelled":
      return "Capture cancelled."
    default:
      return fallback
  }
}

export function buildCameraConstraintAttempts(
  enabled: boolean = ENABLE_CAMERA_CONSTRAINTS,
): MediaStreamConstraints[] {
  if (!enabled) {
    return [
      {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      },
    ]
  }

  return [
    {
      video: {
        width: { ideal: CAMERA_IDEAL_WIDTH },
        height: { ideal: CAMERA_IDEAL_HEIGHT },
        facingMode: "user",
      },
      audio: false,
    },
    {
      video: {
        facingMode: "user",
      },
      audio: false,
    },
    {
      video: true,
      audio: false,
    },
  ]
}

export function isWarmedUp(
  playStartTimeMs: number | null,
  nowMs: number,
  hasCurrentData: boolean,
  warmupMs: number = WARMUP_MS,
  enabled: boolean = ENABLE_CAMERA_WARMUP,
): boolean {
  if (!enabled) return hasCurrentData
  if (playStartTimeMs === null) return false
  if (!hasCurrentData) return false
  return nowMs - playStartTimeMs >= warmupMs
}

export type DistanceSummary = {
  attempts: number
  min: number | null
  median: number | null
  max: number | null
}

export type FaceDebugData = {
  videoWidth: number
  videoHeight: number
  trackSettings?: {
    width?: number
    height?: number
    frameRate?: number
  }
  score: number | null
  boxWidthPx: number | null
  boxWidthPercent: number | null
}

export function isFaceDebugEnabled(): boolean {
  if (typeof window === "undefined" || !window.location) return false
  try {
    return new URLSearchParams(window.location.search).get("facedebug") === "1"
  } catch {
    return false
  }
}

export function summariseDistances(distances: number[]): DistanceSummary {
  if (distances.length === 0) {
    return { attempts: 0, min: null, median: null, max: null }
  }
  const sorted = [...distances].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid]
  return {
    attempts: distances.length,
    min,
    median,
    max,
  }
}

const sessionDistances: number[] = []

export function recordSessionDistance(dist: number): void {
  if (Number.isFinite(dist)) {
    sessionDistances.push(dist)
  }
}

export function getSessionDistances(): number[] {
  return [...sessionDistances]
}

export function clearSessionDistances(): void {
  sessionDistances.length = 0
}
