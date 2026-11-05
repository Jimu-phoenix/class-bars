import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Loader2, Mail, Save } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { ProfileRow } from "@/types/db"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type ProfileFields = Pick<ProfileRow, "full_name" | "role" | "student_number" | "phone_number">

function Field({
  id,
  label,
  children,
  className,
}: {
  id: string
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  )
}

export default function ProfileSettings() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const [fullName, setFullName] = useState("")
  const [role, setRole] = useState<ProfileRow["role"] | null>(null)
  const [studentNumber, setStudentNumber] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [loadedStudentNumber, setLoadedStudentNumber] = useState("")
  // Whether the user is about to set a (new) registration number.
  const [pendingStudentNumber, setPendingStudentNumber] = useState<string | null>(null)

  function applyProfile(data: ProfileFields) {
    setFullName(data.full_name)
    setRole(data.role)
    const loaded = data.student_number ?? ""
    setStudentNumber(loaded)
    setLoadedStudentNumber(loaded)
    setPhoneNumber(data.phone_number ?? "")
  }

  const loadProfileFromDb = useCallback(async () => {
    if (!user) return
    const userId = user.id

    const { data, error: fetchError } = await supabase
      .from("profiles")
      .select("full_name, role, student_number, phone_number")
      .eq("id", userId)
      .maybeSingle()

    if (fetchError) {
      setError("Failed to load profile")
    } else if (data) {
      applyProfile(data)
    } else {
      // No profile row. The row is created server-side by the signup
      // trigger; the client must NOT insert its own — doing so used to
      // let a user authorise themselves into a role they had not been granted.
      setError(
        "Your profile has not been created yet. Please sign out and back in, or contact support.",
      )
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    const currentUser = user
    if (!currentUser) return

    async function init() {
      await loadProfileFromDb()
    }
    void init()
  }, [user, loadProfileFromDb])

  const doSave = async () => {
    if (!user) return
    setError("")
    setSuccess(false)
    setSaving(true)
    try {
      const fullNameValue = fullName.trim()
      const phoneValue = phoneNumber.trim() || null

      let studentNumberValue: string | null = null
      if (role === "student" && loadedStudentNumber === "") {
        const trimmed = pendingStudentNumber?.trim() ?? ""
        studentNumberValue = trimmed || null
      }

      const { error: rpcError } = await supabase.rpc("update_my_profile", {
        p_full_name: fullNameValue,
        p_phone_number: phoneValue,
        p_student_number: studentNumberValue,
      })
      if (rpcError) throw rpcError

      setPendingStudentNumber(null)
      setSuccess(true)
      void loadProfileFromDb()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (
      role === "student" &&
      loadedStudentNumber === "" &&
      pendingStudentNumber === null &&
      studentNumber.trim().length > 0
    ) {
      setPendingStudentNumber(studentNumber.trim())
      setConfirmOpen(true)
      return
    }
    await doSave()
  }

  const handleConfirmSet = async () => {
    setConfirmOpen(false)
    await doSave()
  }

  const handleCancel = () => {
    setConfirmOpen(false)
    setPendingStudentNumber(null)
  }

  const isStudent = role === "student"
  const studentNumberSet = loadedStudentNumber !== ""

  return (
    <section aria-labelledby="details-heading" className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border p-4 sm:p-5">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary"
        >
          {(fullName || "?").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{fullName || "—"}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Mail className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{user?.email}</span>
          </p>
        </div>
        {role && (
          <Badge variant="secondary" className="shrink-0 capitalize">
            {role}
          </Badge>
        )}
      </div>

      <div className="p-4 sm:p-5">
        <h2 id="details-heading" className="text-base font-semibold">
          Personal details
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">Shown on your attendance records.</p>

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="mb-4 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary">
            Profile updated.
          </p>
        )}

        {loading ? (
          <div className="space-y-4" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-4">
            <Field id="full_name" label="Full name">
              <Input
                id="full_name"
                required
                autoComplete="name"
                placeholder="Jane Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-11"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              {isStudent ? (
                <Field id="id_number" label="Student number">
                  {studentNumberSet ? (
                    <>
                      <Input
                        id="id_number"
                        placeholder="BIS/2X/SS/00X"
                        value={studentNumber}
                        readOnly
                        className="h-11 bg-muted/50"
                        disabled
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Registration number cannot be changed. Contact an
                        administrator for corrections.
                      </p>
                    </>
                  ) : (
                    <>
                      <Input
                        id="id_number"
                        placeholder="BIS/2X/SS/00X"
                        value={studentNumber}
                        onChange={(e) => setStudentNumber(e.target.value)}
                        className="h-11"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        You can only save this once. Check it carefully.
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Type it above, then click Save changes to confirm.
                      </p>
                    </>
                  )}
                </Field>
              ) : null}

              <Field id="phone_number" label="Phone number" className={isStudent ? undefined : "sm:col-span-2"}>
                <Input
                  id="phone_number"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+265 999 000 000"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="h-11"
                />
              </Field>
            </div>

            <Button type="submit" disabled={saving} className="h-11 w-full sm:ml-auto sm:w-auto">
              {saving ? (
                <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
              ) : (
                <Save data-icon="inline-start" aria-hidden="true" />
              )}
              Save changes
            </Button>
          </form>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={handleCancel}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save registration number?</DialogTitle>
            <DialogDescription>
              You are about to set your registration number to{" "}
              <strong>{pendingStudentNumber ?? ""}</strong>. You will not be
              able to change this later. Contact an administrator if you need
              a correction.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={saving}
              className="h-10"
              autoFocus
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSet}
              disabled={saving || !pendingStudentNumber}
              className="h-10"
            >
              {saving ? (
                <Loader2 className="mr-2 size-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
