export const MATCH_THRESHOLD = 0.6;

// Version tag stamped on face_embeddings rows by the recognition model.
// Check-in only compares against an active embedding with the same tag, so
// bumping this (or the underlying recognition net) can never silently
// mismatch descriptors.
export const FACE_MODEL_VERSION = "face-api-recognition-tiny-v1";

export function euclideanDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error("Descriptor lengths do not match");
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function isMatch(
  registered: Float32Array,
  detected: Float32Array,
  threshold = MATCH_THRESHOLD,
): boolean {
  return euclideanDistance(registered, detected) < threshold;
}

export function parseEmbedding(embeddingJson: string): Float32Array | null {
  try {
    const arr = JSON.parse(embeddingJson) as number[];
    return arr.length === 128 ? new Float32Array(arr) : null;
  } catch {
    return null;
  }
}

// Descriptors use Euclidean distance (lower is closer), while
// attendance_records.confidence_score is a 0-1 "similarity". Clamp so the
// score stays reportable.
export function faceConfidence(distance: number): number {
  return Math.max(0, Math.min(1, 1 - distance));
}