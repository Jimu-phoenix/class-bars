import {
  QUALITY_BRIGHTNESS_MAX,
  QUALITY_BRIGHTNESS_MIN,
  QUALITY_MAX_POSE_DEG,
  QUALITY_MIN_DETECTION_SCORE,
  QUALITY_MIN_FACE_FRACTION,
  QUALITY_MIN_SHARPNESS,
  QUALITY_SAMPLE_STEP,
  type CaptureFailureReason,
} from "@/lib/faceCapture"

export type Point = { x: number; y: number }

export type Box = {
  x: number
  y: number
  width: number
  height: number
}

export type RgbaImage = {
  data: Uint8ClampedArray
  width: number
  height: number
}

export type QualityConfig = {
  minDetectionScore: number
  minFaceFraction: number
  maxPoseDeg: number
  minSharpness: number
  brightnessMin: number
  brightnessMax: number
  sampleStep: number
}

export const DEFAULT_QUALITY_CONFIG: QualityConfig = {
  minDetectionScore: QUALITY_MIN_DETECTION_SCORE,
  minFaceFraction: QUALITY_MIN_FACE_FRACTION,
  maxPoseDeg: QUALITY_MAX_POSE_DEG,
  minSharpness: QUALITY_MIN_SHARPNESS,
  brightnessMin: QUALITY_BRIGHTNESS_MIN,
  brightnessMax: QUALITY_BRIGHTNESS_MAX,
  sampleStep: QUALITY_SAMPLE_STEP,
}

export type FrameQualityInput = {
  score: number | null
  faceCount: number
  box: Box | null
  landmarks: Point[] | null
  image: RgbaImage
  frameWidth: number
  frameHeight: number
}

export type FrameQualityMetrics = {
  score: number
  faceCount: number
  faceFraction: number
  yawDeg: number | null
  rollDeg: number | null
  sharpness: number
  brightness: number
  passed: boolean
  reasons: CaptureFailureReason[]
}

function luminance(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const index = (y * width + x) * 4
  return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]
}

function imageStats(image: RgbaImage, sampleStep: number) {
  const step = Math.max(1, Math.floor(sampleStep))
  const { data, width, height } = image
  if (width < step * 2 + 1 || height < step * 2 + 1) return null
  if (data.length < width * height * 4) return null

  let count = 0
  let brightnessSum = 0
  let laplacianSum = 0
  let laplacianSumSquares = 0

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const center = luminance(data, width, x, y)
      const left = luminance(data, width, x - step, y)
      const right = luminance(data, width, x + step, y)
      const up = luminance(data, width, x, y - step)
      const down = luminance(data, width, x, y + step)
      const laplacian = 4 * center - left - right - up - down

      count += 1
      brightnessSum += center
      laplacianSum += laplacian
      laplacianSumSquares += laplacian * laplacian
    }
  }

  if (count === 0) return null

  const brightness = brightnessSum / count
  const laplacianMean = laplacianSum / count
  const sharpness = Math.max(
    0,
    laplacianSumSquares / count - laplacianMean * laplacianMean,
  )
  return { brightness, sharpness }
}

function averagePoint(points: Point[]): Point {
  let x = 0
  let y = 0
  for (const point of points) {
    x += point.x
    y += point.y
  }
  return { x: x / points.length, y: y / points.length }
}

export function estimateHeadPose(landmarks: Point[] | null): {
  yawDeg: number | null
  rollDeg: number | null
} {
  if (!landmarks || landmarks.length < 68) {
    return { yawDeg: null, rollDeg: null }
  }
  if (!landmarks.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
    return { yawDeg: null, rollDeg: null }
  }

  const leftEye = averagePoint(landmarks.slice(36, 42))
  const rightEye = averagePoint(landmarks.slice(42, 48))
  const eyeMid = {
    x: (leftEye.x + rightEye.x) / 2,
    y: (leftEye.y + rightEye.y) / 2,
  }
  const interocular = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y)
  if (!Number.isFinite(interocular) || interocular <= 0) {
    return { yawDeg: null, rollDeg: null }
  }

  const nose = landmarks[30]
  const rollDeg =
    (Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180) / Math.PI
  const yawDeg =
    (Math.atan2(nose.x - eyeMid.x, interocular) * 180) / Math.PI

  if (!Number.isFinite(yawDeg) || !Number.isFinite(rollDeg)) {
    return { yawDeg: null, rollDeg: null }
  }
  return { yawDeg, rollDeg }
}

export function evaluateFrameQuality(
  input: FrameQualityInput,
  config: QualityConfig = DEFAULT_QUALITY_CONFIG,
): FrameQualityMetrics {
  const reasons: CaptureFailureReason[] = []
  const score = input.score ?? 0
  const faceFraction =
    input.box && input.frameWidth > 0 ? input.box.width / input.frameWidth : 0

  if (input.faceCount === 0) {
    reasons.push("no_face")
  } else if (input.faceCount > 1) {
    reasons.push("multiple_faces")
  }

  if (input.faceCount === 1 && score < config.minDetectionScore) {
    reasons.push("low_score")
  }
  if (input.faceCount === 1 && faceFraction < config.minFaceFraction) {
    reasons.push("face_too_small")
  }

  const { yawDeg, rollDeg } = estimateHeadPose(input.landmarks)
  if (input.faceCount === 1) {
    if (yawDeg === null || rollDeg === null) {
      reasons.push("landmarks_missing")
    } else if (
      Math.abs(yawDeg) > config.maxPoseDeg ||
      Math.abs(rollDeg) > config.maxPoseDeg
    ) {
      reasons.push("pose")
    }
  }

  const stats = imageStats(input.image, config.sampleStep)
  const brightness = stats?.brightness ?? 0
  const sharpness = stats?.sharpness ?? 0
  if (!stats) {
    reasons.push("camera_error")
  } else {
    if (sharpness < config.minSharpness) reasons.push("blurry")
    if (brightness < config.brightnessMin) reasons.push("too_dark")
    else if (brightness > config.brightnessMax) reasons.push("too_bright")
  }

  return {
    score,
    faceCount: input.faceCount,
    faceFraction,
    yawDeg,
    rollDeg,
    sharpness,
    brightness,
    passed: reasons.length === 0,
    reasons,
  }
}
