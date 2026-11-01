import assert from "node:assert/strict"
import { test } from "node:test"
import {
  summariseDistances,
  recordSessionDistance,
  getSessionDistances,
  clearSessionDistances,
  DETECTOR_INPUT_SIZE,
  DETECTOR_SCORE_THRESHOLD,
  USE_TINY_LANDMARKS,
  ENROL_DETECTOR,
  SSD_MIN_CONFIDENCE,
  VERIFY_INPUT_SIZE,
  buildCameraConstraintAttempts,
  isWarmedUp,
  CAMERA_IDEAL_WIDTH,
  CAMERA_IDEAL_HEIGHT,
  WARMUP_MS,
  ENABLE_CAMERA_CONSTRAINTS,
  ENABLE_CAMERA_WARMUP,
  CAPTURE_FRAME_COUNT,
  CAPTURE_MIN_INTERVAL_MS,
  CAPTURE_MAX_INTERVAL_MS,
  CAPTURE_TIMEOUT_MS,
  CAPTURE_INACTIVITY_STOP_MS,
  QUALITY_MIN_DETECTION_SCORE,
  QUALITY_MIN_FACE_FRACTION,
  QUALITY_MAX_POSE_DEG,
  QUALITY_MIN_SHARPNESS,
  QUALITY_BRIGHTNESS_MIN,
  QUALITY_BRIGHTNESS_MAX,
  nextCaptureIntervalMs,
  captureStatusMessage,
} from "../src/lib/faceCapture.ts"

test("summariseDistances returns empty stats for empty input", () => {
  const result = summariseDistances([])
  assert.deepEqual(result, {
    attempts: 0,
    min: null,
    median: null,
    max: null,
  })
})

test("summariseDistances handles a single distance", () => {
  const result = summariseDistances([0.45])
  assert.deepEqual(result, {
    attempts: 1,
    min: 0.45,
    median: 0.45,
    max: 0.45,
  })
})

test("summariseDistances handles odd-length unsorted distances", () => {
  const result = summariseDistances([0.7, 0.2, 0.5])
  assert.deepEqual(result, {
    attempts: 3,
    min: 0.2,
    median: 0.5,
    max: 0.7,
  })
})

test("summariseDistances handles even-length unsorted distances", () => {
  const result = summariseDistances([0.6, 0.3, 0.4, 0.5])
  // sorted: [0.3, 0.4, 0.5, 0.6], median is (0.4 + 0.5) / 2 = 0.45
  assert.deepEqual(result, {
    attempts: 4,
    min: 0.3,
    median: 0.45,
    max: 0.6,
  })
})

test("session distances recording and clearing", () => {
  clearSessionDistances()
  assert.deepEqual(getSessionDistances(), [])
  recordSessionDistance(0.42)
  recordSessionDistance(0.58)
  assert.deepEqual(getSessionDistances(), [0.42, 0.58])
  const summary = summariseDistances(getSessionDistances())
  assert.equal(summary.attempts, 2)
  assert.equal(summary.min, 0.42)
  assert.equal(summary.max, 0.58)
  assert.equal(summary.median, 0.5)
  clearSessionDistances()
  assert.deepEqual(getSessionDistances(), [])
})

test("pipeline constants match required baseline", () => {
  assert.equal(DETECTOR_INPUT_SIZE, 320)
  assert.equal(VERIFY_INPUT_SIZE, 416)
  assert.equal(DETECTOR_SCORE_THRESHOLD, 0.4)
  assert.equal(USE_TINY_LANDMARKS, false)
  assert.equal(ENROL_DETECTOR, "ssd")
  assert.equal(SSD_MIN_CONFIDENCE, 0.6)
  assert.equal(CAMERA_IDEAL_WIDTH, 1280)
  assert.equal(CAMERA_IDEAL_HEIGHT, 720)
  assert.equal(WARMUP_MS, 800)
  assert.equal(ENABLE_CAMERA_CONSTRAINTS, true)
  assert.equal(ENABLE_CAMERA_WARMUP, true)
})

test("buildCameraConstraintAttempts returns progressive constraints when enabled", () => {
  const attempts = buildCameraConstraintAttempts(true)
  assert.equal(attempts.length, 3)

  // 1st attempt: 1280x720 ideal facingMode user
  assert.deepEqual(attempts[0], {
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "user",
    },
    audio: false,
  })

  // 2nd attempt: user camera only
  assert.deepEqual(attempts[1], {
    video: {
      facingMode: "user",
    },
    audio: false,
  })

  // 3rd attempt: plain video true
  assert.deepEqual(attempts[2], {
    video: true,
    audio: false,
  })
})

test("buildCameraConstraintAttempts returns single fallback when disabled", () => {
  const attempts = buildCameraConstraintAttempts(false)
  assert.equal(attempts.length, 1)
  assert.deepEqual(attempts[0], {
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: "user",
    },
    audio: false,
  })
})

test("isWarmedUp enforces warmup duration and data readiness", () => {
  const start = 1000

  // Before stream starts playing
  assert.equal(isWarmedUp(null, 1500, true), false)

  // Playing but video does not have current data yet
  assert.equal(isWarmedUp(start, 2000, false), false)

  // Within warmup window (< 800ms elapsed)
  assert.equal(isWarmedUp(start, start + 500, true), false)
  assert.equal(isWarmedUp(start, start + 799, true), false)

  // Warmup elapsed and data ready
  assert.equal(isWarmedUp(start, start + 800, true), true)
  assert.equal(isWarmedUp(start, start + 1200, true), true)

  // When warm-up is disabled, returns hasCurrentData immediately
  assert.equal(isWarmedUp(start, start + 100, true, 800, false), true)
  assert.equal(isWarmedUp(start, start + 100, false, 800, false), false)
})


test("burst constants match the approved capture settings", () => {
  assert.equal(CAPTURE_FRAME_COUNT, 3)
  assert.equal(CAPTURE_MIN_INTERVAL_MS, 250)
  assert.equal(CAPTURE_MAX_INTERVAL_MS, 400)
  assert.equal(CAPTURE_TIMEOUT_MS, 10_000)
  assert.equal(CAPTURE_INACTIVITY_STOP_MS, 60_000)
  assert.equal(QUALITY_MIN_DETECTION_SCORE, 0.6)
  assert.equal(QUALITY_MIN_FACE_FRACTION, 0.25)
  assert.equal(QUALITY_MAX_POSE_DEG, 20)
  assert.equal(QUALITY_MIN_SHARPNESS, 100)
  assert.equal(QUALITY_BRIGHTNESS_MIN, 50)
  assert.equal(QUALITY_BRIGHTNESS_MAX, 210)
})

test("nextCaptureIntervalMs stays within the configured range", () => {
  assert.equal(nextCaptureIntervalMs(250, 400, () => 0), 250)
  assert.equal(nextCaptureIntervalMs(250, 400, () => 1), 400)
  assert.equal(nextCaptureIntervalMs(250, 400, () => 0.5), 325)
  assert.equal(nextCaptureIntervalMs(300, 300, () => 0.5), 300)
  assert.equal(nextCaptureIntervalMs(400, 250, () => 0.5), 400)
})

test("captureStatusMessage maps common rejection reasons", () => {
  assert.match(captureStatusMessage("no_face"), /No face detected/)
  assert.match(captureStatusMessage("multiple_faces"), /Multiple faces detected/)
  assert.match(captureStatusMessage("face_too_small"), /Move closer/)
  assert.match(captureStatusMessage("pose"), /straight on/)
  assert.match(captureStatusMessage("timeout"), /in time/)
  assert.equal(captureStatusMessage(null), "Position your face in the oval.")
  assert.equal(captureStatusMessage(null, "fallback"), "fallback")
})
