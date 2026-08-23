import { useState, useCallback } from "react";
import { useFaceDetection } from "@/hooks/useFaceDetection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { saveDescriptor, loadDescriptor, clearDescriptor } from "@/lib/faceStorage";
import { euclideanDistance, isMatch, MATCH_THRESHOLD } from "@/lib/faceCompare";

type Mode = "register" | "verify";

function formatDescriptor(desc: Float32Array): string {
  const values = Array.from(desc.slice(0, 10))
    .map((v) => v.toFixed(4))
    .join(", ");
  return `[${values}, ...] (128-d total)`;
}

function LoadingDetectors() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-lg font-medium text-foreground">
        Loading detectors...
      </p>
    </div>
  );
}

function CameraErrorState({ error }: { error: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <div className="rounded-full bg-destructive/10 p-3">
        <svg
          className="h-6 w-6 text-destructive"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <p className="text-lg font-medium text-foreground">Camera Error</p>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        {error.includes("Permission")
          ? "Camera access was denied. Please allow camera access in your browser settings and reload."
          : error}
      </p>
    </div>
  );
}

function RegisterMode({
  result,
  faceCount,
}: {
  result: ReturnType<typeof useFaceDetection>["results"][number] | undefined;
  faceCount: number;
}) {
  const [saved, setSaved] = useState(false);

  if (faceCount === 0 || !result) {
    return (
      <Card size="sm" className="text-center">
        <CardContent className="py-4">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-muted-foreground/50" />
            <span className="text-sm">No face detected</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleSave = () => {
    saveDescriptor(result.detection.descriptor);
    setSaved(true);
  };

  return (
    <div className="flex flex-col gap-3">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Face Detected</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant="default">1 face</Badge>
          <Badge variant="outline">
            {(result.detection.confidence * 100).toFixed(1)}% confidence
          </Badge>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Face Descriptor</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="break-all font-mono text-xs text-foreground">
            {formatDescriptor(result.detection.descriptor)}
          </p>
        </CardContent>
      </Card>

      {saved ? (
        <Card size="sm" className="border-green-500/30 bg-green-500/5">
          <CardContent className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium">Face registered successfully!</span>
          </CardContent>
        </Card>
      ) : (
        <button
          onClick={handleSave}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/80"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Register This Face
        </button>
      )}
    </div>
  );
}

function VerifyMode({
  result,
  faceCount,
}: {
  result: ReturnType<typeof useFaceDetection>["results"][number] | undefined;
  faceCount: number;
}) {
  const [registered, setRegistered] = useState(loadDescriptor());

  const match = registered && faceCount > 0 && result
    ? (() => {
        const distance = euclideanDistance(registered, result.detection.descriptor);
        return { match: isMatch(registered, result.detection.descriptor), distance };
      })()
    : null;

  if (faceCount === 0 || !result) {
    return (
      <Card size="sm" className="text-center">
        <CardContent className="py-4">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-muted-foreground/50" />
            <span className="text-sm">No face detected</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!registered) {
    return (
      <Card size="sm" className="border-destructive/30 bg-destructive/5">
        <CardContent className="flex flex-col items-center gap-2 text-center py-4">
          <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium text-foreground">No face registered</p>
          <p className="text-xs text-muted-foreground">Switch to Register mode first</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Verification Status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant={match?.match ? "default" : "destructive"} className="text-sm">
            {match?.match ? "MATCH" : "NO MATCH"}
          </Badge>
          <Badge variant="outline" className="font-mono text-xs">
            Distance: {match?.distance?.toFixed(4) ?? "—"}
          </Badge>
          <Badge variant="outline" className="font-mono text-xs">
            Threshold: {MATCH_THRESHOLD}
          </Badge>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Detected Face</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Confidence</span>
            <span className="font-mono text-xs text-foreground">
              {(result.detection.confidence * 100).toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Landmarks</span>
            <span className="font-mono text-xs text-foreground">
              {result.detection.landmarksCount}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Distance</span>
            <span className="font-mono text-xs text-foreground">
              {match?.distance?.toFixed(4) ?? "—"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Registered Face</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="break-all font-mono text-xs text-foreground">
            {formatDescriptor(registered)}
          </p>
        </CardContent>
      </Card>

      <button
        onClick={() => {
          clearDescriptor();
          setRegistered(null);
        }}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Clear Registered Face
      </button>
    </div>
  );
}

function FaceVerify() {
  const {
    videoRef,
    canvasRef,
    results,
    faceCount,
    isLoading,
    error,
    recognitionReady,
  } = useFaceDetection();

  const [mode, setMode] = useState<Mode>("verify");

  const result = results[0];

  const handleModeChange = useCallback((newMode: Mode) => {
    setMode(newMode);
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 md:p-8">
      <header className="flex items-center justify-between">
        <div>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            &larr; Back to Home
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-foreground">
            Face Verification
          </h1>
          <p className="text-sm text-muted-foreground">
            Register a face, then verify matches in real-time
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted lg:w-1/2">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <LoadingDetectors />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <CameraErrorState error={error} />
            </div>
          )}
        </div>

        <div className="w-full lg:w-1/2">
          <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
            <h2 className="text-lg font-semibold text-foreground">
              {mode === "register" ? "Register New Face" : "Verify Face"}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleModeChange("register")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === "register"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Register
              </button>
              <button
                onClick={() => handleModeChange("verify")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === "verify"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Verify
              </button>
            </div>
          </div>

          {!recognitionReady ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Loading recognition model…
            </div>
          ) : mode === "register" ? (
            <RegisterMode result={result} faceCount={faceCount} />
          ) : (
            <VerifyMode result={result} faceCount={faceCount} />
          )}
        </div>
      </div>
    </div>
  );
}

export default FaceVerify;