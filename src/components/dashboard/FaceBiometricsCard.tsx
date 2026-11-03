import { useState, useEffect, useCallback } from "react"
import { CheckCircle2, Loader2, ScanFace, Trash2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import {
  clearFaceEmbedding,
  getActiveFaceEmbedding,
  upsertFaceEmbedding,
  FACE_MODEL_VERSION,
} from "@/lib/realAttendance"
import { fullScreenOnMobile } from "@/lib/dialogClasses"
import FaceEnrollCard from "@/components/face/FaceEnrollCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { FaceEmbeddingRow } from "@/types/db"

type FaceBiometricsCardProps = {
  hasConsent?: boolean
}

export default function FaceBiometricsCard({ hasConsent }: FaceBiometricsCardProps = {}) {
  const { user } = useAuth()

  const [embedding, setEmbedding] = useState<FaceEmbeddingRow | null>(null)
  const [embeddingLoading, setEmbeddingLoading] = useState(false)
  const [embeddingError, setEmbeddingError] = useState("")
  const [embeddingNotice, setEmbeddingNotice] = useState("")
  const [showEnroll, setShowEnroll] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [consentLoading, setConsentLoading] = useState(true)
  const [consentStatus, setConsentStatus] = useState<boolean | null>(null)

  const loadConsent = useCallback(async () => {
    if (!user) {
      setConsentLoading(false)
      setConsentStatus(null)
      return
    }
    setConsentLoading(true)
    try {
      const { data } = await supabase
        .from("profiles")
        .select("consent_given_at")
        .eq("id", user.id)
        .maybeSingle()
      setConsentStatus(!!(data as { consent_given_at: string | null } | null)?.consent_given_at)
    } catch {
      setConsentStatus(null)
    } finally {
      setConsentLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    const timer = window.setTimeout(() => void loadConsent(), 0)
    return () => window.clearTimeout(timer)
  }, [user, loadConsent])

  const canEnroll = hasConsent ?? consentStatus

  const loadEmbedding = useCallback(async () => {
    if (!user) return
    setEmbeddingLoading(true)
    setEmbeddingError("")
    try {
      const row = await getActiveFaceEmbedding(user.id)
      setEmbedding(row)
    } catch (err) {
      setEmbeddingError(err instanceof Error ? err.message : "Failed to load face status")
    } finally {
      setEmbeddingLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    const timer = window.setTimeout(() => void loadEmbedding(), 0)
    return () => window.clearTimeout(timer)
  }, [user, loadEmbedding])

  const handleFaceSaved = async (descriptor: Float32Array) => {
    await upsertFaceEmbedding(descriptor)
    setShowEnroll(false)
    setEmbeddingNotice("Face template saved.")
    try {
      await loadEmbedding()
    } catch {
      // the notice above already communicates success
    }
  }

  const handleClearFace = async () => {
    setConfirmRemove(false)
    setEmbeddingNotice("")
    setEmbeddingError("")
    setEmbeddingLoading(true)
    try {
      await clearFaceEmbedding()
      setEmbedding(null)
      setEmbeddingNotice("Face template removed.")
    } catch (err) {
      setEmbeddingError(err instanceof Error ? err.message : "Failed to remove face template")
    } finally {
      setEmbeddingLoading(false)
    }
  }

  if (consentLoading) {
    return (
      <section
        aria-labelledby="face-heading"
        className="rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Loading consent status…</span>
        </div>
      </section>
    )
  }

  if (!canEnroll) {
    return (
      <section
        aria-labelledby="face-heading"
        className="rounded-xl border border-border bg-card p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"
          >
            <ScanFace className="size-4.5" />
          </span>
          <div className="min-w-0">
            <h2 id="face-heading" className="text-base font-semibold">
              Face biometrics
            </h2>
            <p className="text-sm text-muted-foreground">
              Used to verify you when joining live classes.
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 sm:p-4">
          <p className="text-sm text-amber-800 dark:text-amber-400">
            Record your consent above before enrolling your face.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="face-heading"
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"
        >
          <ScanFace className="size-4.5" />
        </span>
        <div className="min-w-0">
          <h2 id="face-heading" className="text-base font-semibold">
            Face biometrics
          </h2>
          <p className="text-sm text-muted-foreground">
            Used to verify you when joining live classes.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {embeddingLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Checking…
          </p>
        ) : embedding ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={embedding.model_version !== FACE_MODEL_VERSION ? "outline" : "default"}>
                {embedding.model_version !== FACE_MODEL_VERSION ? "Update required" : "Enrolled"}
              </Badge>
              <span className="text-muted-foreground">
                {embedding.model_version} · saved {new Date(embedding.updated_at).toLocaleDateString()}
              </span>
            </div>
            {embedding.model_version !== FACE_MODEL_VERSION && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Your face template was saved with an older model version. Please update your face to continue checking in.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No face template yet — add one to check into live classes.
          </p>
        )}

        {embeddingError && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {embeddingError}
          </p>
        )}
        {embeddingNotice && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2.5 text-sm text-green-700 dark:text-green-300"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            {embeddingNotice}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="h-11 sm:h-9"
            disabled={embeddingLoading}
            onClick={() => {
              setShowEnroll(true)
              setEmbeddingNotice("")
            }}
          >
            <ScanFace data-icon="inline-start" aria-hidden="true" />
            {embedding ? "Update face" : "Add face"}
          </Button>
          {embedding && (
            <Button
              variant="ghost"
              className="h-11 sm:h-9"
              onClick={() => setConfirmRemove(true)}
              disabled={embeddingLoading}
            >
              <Trash2 data-icon="inline-start" aria-hidden="true" />
              Remove
            </Button>
          )}
        </div>
      </div>

      {/* Enrollment: full-screen on phones so the camera has room */}
      <Dialog open={showEnroll} onOpenChange={setShowEnroll}>
        <DialogContent className={fullScreenOnMobile}>
          <DialogHeader>
            <DialogTitle>{embedding ? "Update your face" : "Add your face"}</DialogTitle>
            <DialogDescription>
              Find good lighting and look straight at the camera.
            </DialogDescription>
          </DialogHeader>
          {showEnroll && (
            <FaceEnrollCard
              actionLabel="Save face template"
              onSave={handleFaceSaved}
              onCancel={() => setShowEnroll(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove face template?</DialogTitle>
            <DialogDescription>
              You won&apos;t be able to check into live classes until you add it again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 max-sm:flex-col-reverse">
            <Button variant="outline" className="h-11 sm:h-9" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
            <Button variant="destructive" className="h-11 sm:h-9" onClick={() => void handleClearFace()}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
