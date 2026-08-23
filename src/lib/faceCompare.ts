export const MATCH_THRESHOLD = 0.6;

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