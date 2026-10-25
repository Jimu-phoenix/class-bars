import { useRef, useState, useEffect } from "react"
import * as faceapi from "face-api.js"
import {
  DETECTION_OPTIONS,
  faceModelsStatus,
  loadDeferredModels,
  loadDetectionModel,
  type FaceModelsStatus,
} from "@/lib/faceModels"
import {
  isFaceDebugEnabled,
  type FaceDebugData,
  USE_TINY_LANDMARKS,
} from "@/lib/faceCapture"

type FaceDetectionResult = {
  confidence: number
  box: { x: number; y: number; width: number; height: number }
  landmarksCount: number
  descriptor: Float32Array
}

type DetectedFace = {
  detection: FaceDetectionResult
}

type RawDetection = {
  detection: {
    score: number
    forSize(width: number, height: number): {
      box: { x: number; y: number; width: number; height: number }
    }
  }
  landmarks?: {
    positions: { x: number; y: number }[]
    forSize(width: number, height: number): { positions: { x: number; y: number }[] }
  }
  descriptor?: Float32Array
}

type UseFaceDetectionReturn = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  results: DetectedFace[]
  faceCount: number
  isLoading: boolean
  error: string | null
  landmarksReady: boolean
  recognitionReady: boolean
  models: FaceModelsStatus
  debugData?: FaceDebugData | null
}

async function setupCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: "user",
    },
    audio: false,
  })
  video.srcObject = stream
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => {
      video.play().then(() => resolve(stream)).catch(reject)
    }
    video.onerror = () => reject(new Error("Video element error"))
  })
}

function drawDetection(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
) {
  ctx.strokeStyle = "#22c55e"
  ctx.lineWidth = 3
  ctx.strokeRect(box.x, box.y, box.width, box.height)

  ctx.fillStyle = "#22c55e"
  ctx.font = "14px monospace"
  ctx.fillText(
    "face",
    box.x,
    box.y > 20 ? box.y - 6 : box.y + box.height + 18,
  )
}

function drawFaceLandmarks(
  ctx: CanvasRenderingContext2D,
  positions: { x: number; y: number }[],
) {
  ctx.fillStyle = "#3b82f6"
  for (const pt of positions) {
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, 1.5, 0, 2 * Math.PI)
    ctx.fill()
  }
}

export function useFaceDetection(): UseFaceDetectionReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isMountedRef = useRef(true)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<DetectedFace[]>([])
  const [faceCount, setFaceCount] = useState(0)
  const [landmarksReady, setLandmarksReady] = useState(false)
  const [recognitionReady, setRecognitionReady] = useState(false)
  const [models, setModels] = useState<FaceModelsStatus>({
    detector: false,
    landmarks: false,
    recognition: false,
  })
  const [debugData, setDebugData] = useState<FaceDebugData | null>(null)

  const landmarksReadyRef = useRef(false)
  const recognitionReadyRef = useRef(false)

  useEffect(() => {
    isMountedRef.current = true
    let detectionActive = true

      async function init() {
        try {
          setError(null)
          setIsLoading(true)

          // Phase 1: load detection model only
          await loadDetectionModel()
          setModels((m) => ({ ...m, detector: true }))

          if (!isMountedRef.current) return

          const video = videoRef.current
          if (!video) throw new Error("Video ref not attached")

          // Phase 2: start camera
          const stream = await setupCamera(video)
          streamRef.current = stream

          if (!isMountedRef.current) {
            stream.getTracks().forEach((t) => t.stop())
            return
          }

          // Phase 3: detection is ready
          setIsLoading(false)

          intervalRef.current = setInterval(async () => {
            if (!detectionActive) return

            const currentVideo = videoRef.current
            const currentCanvas = canvasRef.current
            if (!currentVideo || !currentCanvas) return

            if (
              currentVideo.readyState < 2 ||
              currentVideo.paused ||
              currentVideo.ended
            ) {
              return
            }

            const displayWidth = currentVideo.clientWidth
            const displayHeight = currentVideo.clientHeight

            if (displayWidth === 0 || displayHeight === 0) return

            currentCanvas.width = displayWidth
            currentCanvas.height = displayHeight

            try {
              const baseTask = faceapi.detectAllFaces(
                currentVideo,
                DETECTION_OPTIONS,
              )
              const landmarkedTask = landmarksReadyRef.current
                ? baseTask.withFaceLandmarks(USE_TINY_LANDMARKS)
                : null
              const descriptorTask =
                landmarkedTask && recognitionReadyRef.current
                  ? landmarkedTask.withFaceDescriptors()
                  : landmarkedTask
              const detections = await (descriptorTask ??
                baseTask) as unknown as RawDetection[]

              if (!detectionActive) return

              setFaceCount(detections.length)

              const ctx = currentCanvas.getContext("2d")
              if (!ctx) return

              ctx.clearRect(0, 0, displayWidth, displayHeight)

              if (detections.length === 0) {
                setResults([])
                return
              }

              const mappedResults: DetectedFace[] = []
              for (const d of detections) {
                const scaledBox = d.detection.forSize(displayWidth, displayHeight)
                const box = {
                  x: scaledBox.box.x,
                  y: scaledBox.box.y,
                  width: scaledBox.box.width,
                  height: scaledBox.box.height,
                }

                const r: DetectedFace = {
                  detection: {
                    confidence: d.detection.score,
                    box,
                    landmarksCount: d.landmarks?.positions?.length ?? 0,
                    descriptor: (d as { descriptor: Float32Array }).descriptor ?? new Float32Array(128),
                  },
                }

                mappedResults.push(r)

                drawDetection(ctx, box)
                if (d.landmarks?.positions) {
                  const shifted = d.landmarks.forSize(
                    displayWidth,
                    displayHeight,
                  )
                  drawFaceLandmarks(ctx, shifted.positions)
                }
              }

              setResults(mappedResults)

              if (isFaceDebugEnabled()) {
                const track = streamRef.current?.getVideoTracks()[0]
                const trackSettings = track?.getSettings()
                const d = detections[0]
                const videoWidth = currentVideo.videoWidth
                const videoHeight = currentVideo.videoHeight
                const boxInVideo = d ? d.detection.forSize(videoWidth, videoHeight).box : null
                const boxWidthPx = boxInVideo ? Math.round(boxInVideo.width) : null
                const boxWidthPercent =
                  boxInVideo && videoWidth > 0
                    ? Number(((boxInVideo.width / videoWidth) * 100).toFixed(1))
                    : null

                setDebugData({
                  videoWidth,
                  videoHeight,
                  trackSettings: trackSettings
                    ? {
                        width: trackSettings.width,
                        height: trackSettings.height,
                        frameRate: trackSettings.frameRate,
                      }
                    : undefined,
                  score: d ? Number(d.detection.score.toFixed(3)) : null,
                  boxWidthPx,
                  boxWidthPercent,
                })
              }
            } catch (detectErr) {
              if (detectionActive) {
                console.error("face-api detection error:", detectErr)
              }
            }
          }, 200)

          // Phase 4: load landmarks and recognition in background
          loadDeferredModels(
            () => {
              landmarksReadyRef.current = true
              setLandmarksReady(true)
              setModels((m) => ({ ...m, landmarks: true }))
            },
            () => {
              recognitionReadyRef.current = true
              setRecognitionReady(true)
              setModels((m) => ({ ...m, recognition: true }))
            },
            (err) => {
              if (!isMountedRef.current) return
              const status = faceModelsStatus()
              setError(
                `Face models failed to load (detector ${status.detector ? "ok" : "missing"}, landmarks ${status.landmarks ? "ok" : "missing"}, recognition ${status.recognition ? "ok" : "missing"}): ${err.message}`,
              )
            },
          )
        } catch (err) {
          if (!isMountedRef.current) return
          const message =
            err instanceof Error ? err.message : "Unknown error during initialization"
          setError(message)
          setIsLoading(false)
        }
      }

      init()

    const currentVideo = videoRef.current

    return () => {
      detectionActive = false
      isMountedRef.current = false

      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (currentVideo) {
        currentVideo.srcObject = null
      }
    }
  }, [])

  return {
    videoRef,
    canvasRef,
    results,
    faceCount,
    isLoading,
    error,
    landmarksReady,
    recognitionReady,
    models,
    debugData,
  }
}
