import * as faceapi from "face-api.js"

export const FACE_MODELS_BASE = "/models"

export const DETECTION_OPTIONS = new faceapi.TinyFaceDetectorOptions({
  inputSize: 320,
  scoreThreshold: 0.4,
})

export async function loadDetectionModel(): Promise<void> {
  await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODELS_BASE)
}

export async function loadDeferredModels(
  onLandmarksReady: () => void,
  onRecognitionReady: () => void,
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