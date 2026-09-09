import { Loader2 } from "lucide-react"
import { isModelError } from "@/lib/faceModels"

export default function FaceCaptureFrame({
  videoRef,
  canvasRef,
  isLoading,
  error,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  isLoading: boolean
  error: string | null
}) {
  return (
    <div className="relative overflow-hidden rounded-md border bg-black">
      <video ref={videoRef} autoPlay playsInline muted className="block w-full" />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      {(isLoading || error) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/85 px-6 text-center">
          {isLoading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Starting camera and detectors…
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">
                {isModelError(error) ? "Face models unavailable" : "Camera unavailable"}
              </p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}