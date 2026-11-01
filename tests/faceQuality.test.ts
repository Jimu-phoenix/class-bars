import assert from "node:assert/strict"
import { test } from "node:test"
import {
  estimateHeadPose,
  evaluateFrameQuality,
  type FrameQualityInput,
  type Point,
  type QualityConfig,
} from "../src/lib/faceQuality.ts"

function makeLandmarks({
  noseX = 50,
  leftEyeY = 40,
  rightEyeY = 40,
}: {
  noseX?: number
  leftEyeY?: number
  rightEyeY?: number
} = {}): Point[] {
  const points = Array.from({ length: 68 }, () => ({ x: 50, y: 50 }))
  for (let i = 36; i < 42; i++) points[i] = { x: 40, y: leftEyeY }
  for (let i = 42; i < 48; i++) points[i] = { x: 60, y: rightEyeY }
  points[30] = { x: noseX, y: 60 }
  return points
}

function makeImage(width: number, height: number, value: number) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }
  return { data, width, height }
}

const permissive: QualityConfig = {
  minDetectionScore: 0,
  minFaceFraction: 0,
  maxPoseDeg: 180,
  minSharpness: 0,
  brightnessMin: 0,
  brightnessMax: 255,
  sampleStep: 2,
}

function qualityInput(
  overrides: Partial<FrameQualityInput> = {},
): FrameQualityInput {
  return {
    score: 0.9,
    faceCount: 1,
    box: { x: 2, y: 2, width: 5, height: 5 },
    landmarks: makeLandmarks(),
    image: makeImage(10, 10, 128),
    frameWidth: 10,
    frameHeight: 10,
    ...overrides,
  }
}

test("estimateHeadPose returns null for missing or short landmarks", () => {
  assert.deepEqual(estimateHeadPose(null), { yawDeg: null, rollDeg: null })
  assert.deepEqual(estimateHeadPose([]), { yawDeg: null, rollDeg: null })
  assert.deepEqual(
    estimateHeadPose(Array.from({ length: 68 }, () => ({ x: Number.NaN, y: 0 }))),
    { yawDeg: null, rollDeg: null },
  )
})

test("estimateHeadPose reports frontal, yaw, and roll angles", () => {
  const frontal = estimateHeadPose(makeLandmarks())
  assert.ok(frontal.yawDeg !== null)
  assert.ok(frontal.rollDeg !== null)
  assert.ok(Math.abs(frontal.yawDeg) < 1e-6)
  assert.ok(Math.abs(frontal.rollDeg) < 1e-6)

  const turned = estimateHeadPose(makeLandmarks({ noseX: 55 }))
  assert.ok(turned.yawDeg !== null)
  assert.ok(turned.yawDeg > 0)

  const tilted = estimateHeadPose(makeLandmarks({ rightEyeY: 50 }))
  assert.ok(tilted.rollDeg !== null)
  assert.ok(Math.abs(tilted.rollDeg - 26.565) < 0.01)
})

test("evaluateFrameQuality passes a permissive, valid frame", () => {
  const result = evaluateFrameQuality(qualityInput(), permissive)
  assert.equal(result.passed, true)
  assert.deepEqual(result.reasons, [])
  assert.equal(result.score, 0.9)
  assert.equal(result.faceCount, 1)
  assert.equal(result.faceFraction, 0.5)
})

test("evaluateFrameQuality reports no face and multiple faces", () => {
  const none = evaluateFrameQuality(
    qualityInput({ faceCount: 0, score: null, box: null, landmarks: null }),
    permissive,
  )
  assert.equal(none.passed, false)
  assert.ok(none.reasons.includes("no_face"))

  const many = evaluateFrameQuality(
    qualityInput({ faceCount: 2, landmarks: null }),
    permissive,
  )
  assert.equal(many.passed, false)
  assert.ok(many.reasons.includes("multiple_faces"))
})

test("evaluateFrameQuality reports low score and small face", () => {
  const result = evaluateFrameQuality(
    qualityInput({
      score: 0.1,
      box: { x: 2, y: 2, width: 1, height: 1 },
    }),
    { ...permissive, minDetectionScore: 0.6, minFaceFraction: 0.25 },
  )
  assert.equal(result.passed, false)
  assert.ok(result.reasons.includes("low_score"))
  assert.ok(result.reasons.includes("face_too_small"))
})

test("evaluateFrameQuality reports pose, brightness, and blur", () => {
  const pose = evaluateFrameQuality(
    qualityInput({ landmarks: makeLandmarks({ noseX: 80 }) }),
    { ...permissive, maxPoseDeg: 20 },
  )
  assert.ok(pose.reasons.includes("pose"))

  const dark = evaluateFrameQuality(
    qualityInput({ image: makeImage(10, 10, 10) }),
    { ...permissive, brightnessMin: 50, brightnessMax: 210 },
  )
  assert.ok(dark.reasons.includes("too_dark"))

  const bright = evaluateFrameQuality(
    qualityInput({ image: makeImage(10, 10, 240) }),
    { ...permissive, brightnessMin: 50, brightnessMax: 210 },
  )
  assert.ok(bright.reasons.includes("too_bright"))

  const blurry = evaluateFrameQuality(
    qualityInput(),
    { ...permissive, minSharpness: 100 },
  )
  assert.ok(blurry.reasons.includes("blurry"))
})

test("evaluateFrameQuality reports camera_error for an unreadable image", () => {
  const result = evaluateFrameQuality(
    qualityInput({ image: makeImage(2, 2, 128) }),
    permissive,
  )
  assert.ok(result.reasons.includes("camera_error"))
})
