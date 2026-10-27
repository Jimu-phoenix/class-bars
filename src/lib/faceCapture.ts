// Pure helpers and constants for the face capture pipeline.
// This file has zero browser/face-api dependencies so it can be tested directly with node:test.

// Pipeline configuration constants: single source of truth for enrolment and verification.
export const DETECTOR_INPUT_SIZE = 320
export const VERIFY_INPUT_SIZE = 416
export const DETECTOR_SCORE_THRESHOLD = 0.4
// Landmark model configuration: false uses the full 68-point net (faceLandmark68Net); true uses tiny net.
export const USE_TINY_LANDMARKS = false

// Detector used for enrolment capture: 'ssd' uses SsdMobilenetv1 with fallback to tiny; 'tiny' uses TinyFaceDetector.
export type EnrolDetectorType = "ssd" | "tiny"
export const ENROL_DETECTOR: EnrolDetectorType = "ssd"
export const SSD_MIN_CONFIDENCE = 0.6

// Camera constraints configuration
export const CAMERA_IDEAL_WIDTH = 1280
export const CAMERA_IDEAL_HEIGHT = 720
export const ENABLE_CAMERA_CONSTRAINTS = true

// Camera warm-up configuration (time to ignore frames after stream starts playing)
export const WARMUP_MS = 800
export const ENABLE_CAMERA_WARMUP = true

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
