import * as faceapi from "face-api.js"
import { FACE_MODEL_VERSION } from "@/lib/faceCompare"

export { FACE_MODEL_VERSION }

export const FACE_MODELS_BASE = "/models"

export const DETECTION_OPTIONS = new faceapi.TinyFaceDetectorOptions({
  inputSize: 320,
  scoreThreshold: 0.4,
})

export function isModelError(message: string | null): boolean {
  return message?.startsWith("Face models failed to load") ?? false
}

export type FaceModelsStatus = {
  detector: boolean
  landmarks: boolean
  recognition: boolean
}

export function faceModelsStatus(): FaceModelsStatus {
  return {
    detector: faceapi.nets.tinyFaceDetector.isLoaded,
    landmarks: faceapi.nets.faceLandmark68TinyNet.isLoaded,
    recognition: faceapi.nets.faceRecognitionNet.isLoaded,
  }
}

export async function loadDetectionModel(): Promise<void> {
  await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODELS_BASE)
}

export async function loadDeferredModels(
  onLandmarksReady: () => void,
  onRecognitionReady: () => void,
  onError: (err: Error) => void = () => {},
): Promise<void> {
  try {
    await Promise.all([
      faceapi.nets.faceLandmark68TinyNet
        .loadFromUri(FACE_MODELS_BASE)
        .then(onLandmarksReady),
      faceapi.nets.faceRecognitionNet
        .loadFromUri(FACE_MODELS_BASE)
        .then(onRecognitionReady),
    ])
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    console.error("Failed to load deferred models:", err)
  }
}

export async function warmFaceModels(): Promise<void> {
  try {
    await Promise.all([
      loadDetectionModel(),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODELS_BASE),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_BASE),
    ])
  } catch (err) {
    console.error("Failed to warm face models:", err)
  }
}