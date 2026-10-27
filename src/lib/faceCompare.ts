export const MATCH_THRESHOLD = 0.6;

// Version tag stamped on face_embeddings rows by the recognition model.
// Check-in only compares against an active embedding with the same tag, so
// bumping this (or the underlying recognition net) can never silently
// mismatch descriptors.
export const FACE_MODEL_VERSION = "face-api-recognition-full68-v1";

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

function unwrapEmbeddingArray(arr: unknown): unknown {
  if (!Array.isArray(arr)) return arr
  if (arr.length === 128 && typeof arr[0] === "number") {
    return arr
  }
  if (arr.length === 1 && Array.isArray(arr[0])) {
    return unwrapEmbeddingArray(arr[0])
  }
  return arr
}

export function parseEmbedding(embeddingJson: unknown): Float32Array | null {
  try {
    let arr: unknown

    if (Array.isArray(embeddingJson)) {
      arr = embeddingJson
    } else if (typeof embeddingJson === "string") {
      const trimmed = embeddingJson.trim()
      if (trimmed === "") return null
      arr = JSON.parse(trimmed)
    } else if (embeddingJson && typeof embeddingJson === "object") {
      arr = embeddingJson
    } else {
      return null
    }

    arr = unwrapEmbeddingArray(arr)

    if (!Array.isArray(arr) || arr.length !== 128) {
      return null
    }
    const numbers = arr.map((n) => {
      if (typeof n === "number") return n
      if (typeof n === "string" && n.trim() !== "") {
        const parsed = Number(n)
        return Number.isFinite(parsed) ? parsed : NaN
      }
      return NaN
    })
    if (numbers.some((n) => !Number.isFinite(n))) {
      return null
    }
    return new Float32Array(numbers)
  } catch {
    return null
  }
}

// Descriptors use Euclidean distance (lower is closer), while
// attendance_records.confidence_score is a 0-1 "similarity". Clamp so the
// score stays reportable.
export function faceConfidence(distance: number): number {
  return Math.max(0, Math.min(1, 1 - distance));
}