import * as faceapi from "face-api.js"
import { FACE_MODEL_VERSION } from "@/lib/faceCompare"
import {
  DETECTOR_INPUT_SIZE,
  DETECTOR_SCORE_THRESHOLD,
  USE_TINY_LANDMARKS,
  SSD_MIN_CONFIDENCE,
} from "@/lib/faceCapture"

export { FACE_MODEL_VERSION }

export const FACE_MODELS_BASE = "/models"

export const DETECTION_OPTIONS = new faceapi.TinyFaceDetectorOptions({
  inputSize: DETECTOR_INPUT_SIZE,
  scoreThreshold: DETECTOR_SCORE_THRESHOLD,
})

export const SSD_DETECTION_OPTIONS = new faceapi.SsdMobilenetv1Options({
  minConfidence: SSD_MIN_CONFIDENCE,
})

let ssdLoadingPromise: Promise<boolean> | null = null

export async function loadSsdModel(): Promise<boolean> {
  if (faceapi.nets.ssdMobilenetv1.isLoaded) return true
  if (!ssdLoadingPromise) {
    ssdLoadingPromise = faceapi.nets.ssdMobilenetv1
      .loadFromUri(FACE_MODELS_BASE)
      .then(() => true)
      .catch((err) => {
        console.warn("Failed to load SSD MobileNetV1 model, falling back to tiny detector:", err)
        return false
      })
  }
  return ssdLoadingPromise
}

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
    landmarks: USE_TINY_LANDMARKS
      ? faceapi.nets.faceLandmark68TinyNet.isLoaded
      : faceapi.nets.faceLandmark68Net.isLoaded,
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
    const landmarkNet = USE_TINY_LANDMARKS
      ? faceapi.nets.faceLandmark68TinyNet
      : faceapi.nets.faceLandmark68Net
    await Promise.all([
      landmarkNet
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
    const landmarkNet = USE_TINY_LANDMARKS
      ? faceapi.nets.faceLandmark68TinyNet
      : faceapi.nets.faceLandmark68Net
    await Promise.all([
      loadDetectionModel(),
      landmarkNet.loadFromUri(FACE_MODELS_BASE),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_BASE),
    ])
  } catch (err) {
    console.error("Failed to warm face models:", err)
  }
}