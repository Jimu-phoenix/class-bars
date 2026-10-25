// Pure helpers and constants for the face capture pipeline.
// This file has zero browser/face-api dependencies so it can be tested directly with node:test.

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
