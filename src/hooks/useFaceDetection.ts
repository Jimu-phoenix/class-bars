import { useRef, useState, useEffect, useCallback, type RefObject } from "react"
import {
  faceModelsStatus,
  loadDeferredModels,
  loadDetectionModel,
  loadSsdModel,
  type FaceModelsStatus,
} from "@/lib/faceModels"
import {
  isFaceDebugEnabled,
  ENROL_DETECTOR,
  CAPTURE_INACTIVITY_STOP_MS,
  buildCameraConstraintAttempts,
  isWarmedUp,
} from "@/lib/faceCapture"
import {
  captureFaceBurst,
  checkVideoCanvasDescriptorEquivalence,
  type BurstResult,
  type DescriptorEquivalence,
} from "@/lib/faceBurst"

export type FaceDetectionMode = "verify" | "enrol"

export type CapturePhase =
  | "starting"
  | "warming"
  | "capturing"
  | "captured"
  | "failed"
  | "paused"
  | "error"

export type UseFaceDetectionOptions = {
  mode?: FaceDetectionMode
  referenceDescriptor?: Float32Array | null
}

export type UseFaceDetectionReturn = {
  videoRef: RefObject<HTMLVideoElement | null>
  isLoading: boolean
  error: string | null
  isWarmingUp: boolean
  landmarksReady: boolean
  recognitionReady: boolean
  models: FaceModelsStatus
  burst: BurstResult | null
  equivalence: DescriptorEquivalence | null
  phase: CapturePhase
  isCameraActive: boolean
  isCapturing: boolean
  retry: () => void
  resume: () => void
  stop: () => void
}

async function setupCamera(
  video: HTMLVideoElement,
): Promise<{ stream: MediaStream; playStartTime: number }> {
  const attempts = buildCameraConstraintAttempts()
  let stream: MediaStream | null = null

  for (let i = 0; i < attempts.length; i++) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(attempts[i])
      break
    } catch (err) {
      const isOverconstrained =
        (typeof OverconstrainedError !== "undefined" && err instanceof OverconstrainedError) ||
        (err instanceof Error && err.name === "OverconstrainedError")
      if (!isOverconstrained || i === attempts.length - 1) {
        throw err
      }
    }
  }

  if (!stream) {
    throw new Error("Failed to acquire camera stream")
  }

  const acquiredStream = stream
  video.srcObject = acquiredStream
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => {
      video
        .play()
        .then(() => resolve({ stream: acquiredStream, playStartTime: performance.now() }))
        .catch(reject)
    }
    video.onerror = () => reject(new Error("Video element error"))
  })
}

function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false)
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      cleanup()
      resolve(true)
    }, ms)
    const onAbort = () => {
      cleanup()
      resolve(false)
    }
    const cleanup = () => {
      window.clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

export function useFaceDetection(options?: UseFaceDetectionOptions): UseFaceDetectionReturn {
  const mode = options?.mode ?? "verify"
  const referenceRef = useRef<Float32Array | null>(options?.referenceDescriptor ?? null)

  useEffect(() => {
    referenceRef.current = options?.referenceDescriptor ?? null
  }, [options?.referenceDescriptor])

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const playStartTimeRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)
  const runIdRef = useRef(0)
  const inactivityTimerRef = useRef<number | null>(null)
  const landmarksReadyRef = useRef(false)
  const recognitionReadyRef = useRef(false)
  const useSsdRef = useRef(false)
  const retryRef = useRef<() => void>(() => {})
  const stopRef = useRef<() => void>(() => {})

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [landmarksReady, setLandmarksReady] = useState(false)
  const [recognitionReady, setRecognitionReady] = useState(false)
  const [models, setModels] = useState<FaceModelsStatus>({
    detector: false,
    landmarks: false,
    recognition: false,
  })
  const [isWarmingUp, setIsWarmingUp] = useState(true)
  const [burst, setBurst] = useState<BurstResult | null>(null)
  const [equivalence, setEquivalence] = useState<DescriptorEquivalence | null>(null)
  const [phase, setPhase] = useState<CapturePhase>("starting")
  const [isCameraActive, setIsCameraActive] = useState(false)

  useEffect(() => {
    isMountedRef.current = true
    let disposed = false

    function clearInactivityTimer() {
      if (inactivityTimerRef.current !== null) {
        window.clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
    }

    function stopStream(updateState = true) {
      clearInactivityTimer()
      const stream = streamRef.current
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      const video = videoRef.current
      if (video) {
        video.onloadedmetadata = null
        video.onerror = null
        video.srcObject = null
      }
      playStartTimeRef.current = null
      if (updateState && isMountedRef.current) {
        setIsCameraActive(false)
      }
    }

    function scheduleInactivityStop() {
      clearInactivityTimer()
      inactivityTimerRef.current = window.setTimeout(() => {
        inactivityTimerRef.current = null
        abortRef.current?.abort()
        stopStream()
        if (isMountedRef.current) setPhase("paused")
      }, CAPTURE_INACTIVITY_STOP_MS)
    }

    function onActivity() {
      if (inactivityTimerRef.current !== null) {
        scheduleInactivityStop()
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState !== "hidden") return
      abortRef.current?.abort()
      stopStream()
      if (isMountedRef.current) {
        setPhase("paused")
        setIsWarmingUp(false)
        setIsLoading(false)
      }
    }

    async function ensureModels(): Promise<boolean> {
      let useSsd = false
      if (mode === "enrol" && ENROL_DETECTOR === "ssd") {
        useSsd = await loadSsdModel()
        if (!useSsd) await loadDetectionModel()
      } else {
        await loadDetectionModel()
      }
      if (disposed) return false
      useSsdRef.current = useSsd
      setModels((current) => ({ ...current, detector: true }))

      const before = faceModelsStatus()
      if (!before.landmarks || !before.recognition) {
        await loadDeferredModels(
          () => {
            landmarksReadyRef.current = true
            if (isMountedRef.current) {
              setLandmarksReady(true)
              setModels((current) => ({ ...current, landmarks: true }))
            }
          },
          () => {
            recognitionReadyRef.current = true
            if (isMountedRef.current) {
              setRecognitionReady(true)
              setModels((current) => ({ ...current, recognition: true }))
            }
          },
          (err) => {
            console.error("Failed to load deferred face models:", err)
          },
        )
      } else {
        landmarksReadyRef.current = true
        recognitionReadyRef.current = true
        setLandmarksReady(true)
        setRecognitionReady(true)
      }

      if (disposed) return false
      const status = faceModelsStatus()
      if (!status.landmarks || !status.recognition) {
        throw new Error(
          `Face models failed to load (detector ${status.detector ? "ok" : "missing"}, landmarks ${status.landmarks ? "ok" : "missing"}, recognition ${status.recognition ? "ok" : "missing"})`,
        )
      }
      return true
    }

    async function ensureCamera(): Promise<HTMLVideoElement | null> {
      const video = videoRef.current
      if (!video) throw new Error("Video ref not attached")
      const existing = streamRef.current
      const live =
        existing?.getVideoTracks().some((track) => track.readyState === "live") ?? false
      if (live) {
        if (isMountedRef.current) setIsCameraActive(true)
        return video
      }

      const { stream, playStartTime } = await setupCamera(video)
      if (disposed) {
        stream.getTracks().forEach((track) => track.stop())
        return null
      }
      streamRef.current = stream
      playStartTimeRef.current = playStartTime
      if (isMountedRef.current) setIsCameraActive(true)
      return video
    }

    async function waitForWarmup(
      video: HTMLVideoElement,
      signal: AbortSignal,
    ): Promise<boolean> {
      while (!disposed) {
        if (signal.aborted) return false
        const hasCurrentData =
          video.readyState >= 2 &&
          !video.paused &&
          !video.ended &&
          video.videoWidth > 0 &&
          video.videoHeight > 0
        if (
          isWarmedUp(
            playStartTimeRef.current,
            performance.now(),
            hasCurrentData,
          )
        ) {
          return true
        }
        if (!(await sleep(100, signal))) return false
      }
      return false
    }

    async function runCapture() {
      if (disposed) return
      const runId = ++runIdRef.current
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      clearInactivityTimer()
      setBurst(null)
      setEquivalence(null)
      setError(null)
      setPhase("starting")
      setIsLoading(true)
      setIsWarmingUp(true)

      try {
        const modelsOk = await ensureModels()
        if (!modelsOk || runId !== runIdRef.current || controller.signal.aborted) return

        const video = await ensureCamera()
        if (!video || runId !== runIdRef.current || controller.signal.aborted) return

        setIsLoading(false)
        setPhase("warming")

        const warmed = await waitForWarmup(video, controller.signal)
        if (!warmed || runId !== runIdRef.current || controller.signal.aborted) return

        setIsWarmingUp(false)
        setPhase("capturing")

        const result = await captureFaceBurst({
          video,
          mode,
          useSsd: useSsdRef.current,
          referenceDescriptor: referenceRef.current,
          signal: controller.signal,
        })
        if (runId !== runIdRef.current || controller.signal.aborted || disposed) return

        setBurst(result)
        setPhase(result.ok ? "captured" : "failed")
        scheduleInactivityStop()

        if (result.ok && import.meta.env.DEV && isFaceDebugEnabled()) {
          void checkVideoCanvasDescriptorEquivalence(
            video,
            mode,
            useSsdRef.current,
          ).then((nextEquivalence) => {
            if (isMountedRef.current && runId === runIdRef.current) {
              setEquivalence(nextEquivalence)
            }
          })
        }
      } catch (err) {
        if (controller.signal.aborted || runId !== runIdRef.current || disposed) return
        setError(err instanceof Error ? err.message : "Unknown error during face capture")
        setPhase("error")
        setIsLoading(false)
        setIsWarmingUp(false)
        stopStream()
      }
    }

    retryRef.current = () => {
      void runCapture()
    }
    stopRef.current = () => {
      abortRef.current?.abort()
      stopStream()
      if (isMountedRef.current) setPhase("paused")
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    document.addEventListener("pointerdown", onActivity, true)
    document.addEventListener("keydown", onActivity, true)
    document.addEventListener("touchstart", onActivity, true)

    void runCapture()

    return () => {
      disposed = true
      isMountedRef.current = false
      runIdRef.current += 1
      abortRef.current?.abort()
      clearInactivityTimer()
      document.removeEventListener("visibilitychange", onVisibilityChange)
      document.removeEventListener("pointerdown", onActivity, true)
      document.removeEventListener("keydown", onActivity, true)
      document.removeEventListener("touchstart", onActivity, true)
      stopStream(false)
    }
  }, [mode])

  const retry = useCallback(() => {
    retryRef.current()
  }, [])

  const resume = useCallback(() => {
    retryRef.current()
  }, [])

  const stop = useCallback(() => {
    stopRef.current()
  }, [])

  return {
    videoRef,
    isLoading,
    error,
    isWarmingUp,
    landmarksReady,
    recognitionReady,
    models,
    burst,
    equivalence,
    phase,
    isCameraActive,
    isCapturing: phase === "capturing",
    retry,
    resume,
    stop,
  }
}
