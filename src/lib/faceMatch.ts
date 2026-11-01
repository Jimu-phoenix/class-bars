export type FaceMatchBand = "accept" | "review" | "retry"

export const MATCH_CONFIDENCE_TOOLTIP =
  "Calibrated on a small pilot; shows how closely the face matched the enrolled face, not the probability that the student is who they claim."

export function displayMatchConfidence(
  score: number | null | undefined,
): number | null {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return null
  }

  const rounded = Math.round((score * 100) / 10) * 10
  return Math.max(10, Math.min(90, rounded))
}
