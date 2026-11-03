import { useRef, useState } from "react"
import { AlertCircle, Loader2, Trash2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useNavigate } from "react-router-dom"
import { DATA_CONTACT_EMAIL } from "@/lib/consent"
import { deleteMyAccount } from "@/lib/account"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function DangerZoneCard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmValue, setConfirmValue] = useState("")
  const submitRef = useRef(false)

  const canDelete = confirmValue === "DELETE"

  const handleDeleteClick = () => {
    setError("")
    setConfirmOpen(true)
    setConfirmValue("")
  }

  const handleConfirmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmValue(e.target.value)
  }

  const handleConfirmDelete = async () => {
    if (submitRef.current) return
    if (!user) return
    setError("")
    setDeleting(true)
    submitRef.current = true
    try {
      await deleteMyAccount()
      // Clear any app-level storage keys (none currently beyond Supabase).
      try {
        window.localStorage.removeItem("class-bars:user")
        window.sessionStorage.removeItem("class-bars:user")
      } catch {
        // storage may be blocked; ignore
      }
      // Stop any camera tracks.
      try {
        const streams = window.document.querySelectorAll("video")
        streams.forEach((el) => {
          const v = el as HTMLVideoElement
          const stream = v.srcObject as MediaStream | null
          if (stream) {
            stream.getTracks().forEach((t) => t.stop())
            v.srcObject = null
          }
        })
      } catch {
        // ignore
      }
      setConfirmOpen(false)
      navigate("/login", { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account")
    } finally {
      setDeleting(false)
      submitRef.current = false
    }
  }

  const handleCancel = () => {
    setConfirmOpen(false)
    setConfirmValue("")
  }

  return (
    <section aria-labelledby="danger-heading" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10"
        >
          <AlertCircle className="size-4.5 text-destructive" />
        </span>
        <div className="min-w-0">
          <h2 id="danger-heading" className="text-base font-semibold">
            Danger zone
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Delete my account. You can delete your account at any time. This
            permanently deletes your profile, face template, course enrolments and
            sign-in. Your past attendance entries remain for class statistics, but
            are no longer linked to you. This cannot be undone.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        onClick={handleDeleteClick}
        disabled={deleting}
        variant="destructive"
        className="mt-4 h-11 w-full sm:w-auto"
      >
        {deleting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
            Deleting…
          </>
        ) : (
          <>
            <Trash2 className="mr-2 size-4" aria-hidden="true" />
            Delete my account
          </>
        )}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This will permanently delete your profile and face template and sign
              you out. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-2">
            <label className="text-sm font-medium">
              Type DELETE to confirm.
            </label>
            <input
              type="text"
              value={confirmValue}
              onChange={handleConfirmChange}
              className="h-10 rounded-md border border-input bg-input px-3 py-2 text-sm text-input placeholder:text-input-foreground focus:ring-primary focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
              maxLength={6}
              disabled={deleting}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={deleting}
              className="h-10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDelete}
              disabled={deleting || !canDelete}
              className="h-10"
            >
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="mt-4 text-xs text-muted-foreground">
        Questions or requests about your data:{""}
        <a
          href={`mailto:${DATA_CONTACT_EMAIL}`}
          className="text-primary underline"
        >
          {DATA_CONTACT_EMAIL}
        </a>
        .
      </p>
    </section>
  )
}
