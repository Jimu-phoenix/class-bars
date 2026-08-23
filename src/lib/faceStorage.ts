const STORAGE_KEY = "registered_face";

export function saveDescriptor(descriptor: Float32Array): void {
  const arr = Array.from(descriptor);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

export function loadDescriptor(): Float32Array | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const arr = JSON.parse(stored) as number[];
    return new Float32Array(arr);
  } catch {
    return null;
  }
}

export function clearDescriptor(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasDescriptor(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}