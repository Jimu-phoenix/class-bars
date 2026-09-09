import { useEffect, useState, type FormEvent } from "react"
import { Loader2, Mail, Save } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { ProfileRow } from "@/types/db"

type ProfileFields = Pick<
  ProfileRow,
  "full_name" | "role" | "student_number" | "staff_number" | "phone_number"
>

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

export default function ProfileSettings() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  const [fullName, setFullName] = useState("")
  const [role, setRole] = useState<ProfileRow["role"] | null>(null)
  const [studentNumber, setStudentNumber] = useState("")
  const [staffNumber, setStaffNumber] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")

  useEffect(() => {
    const currentUser = user
    if (!currentUser) return

    const userId = currentUser.id
    const fallbackName =
      currentUser.user_metadata?.full_name ?? "User"
    const metadataRole =
      currentUser.user_metadata?.role === "lecturer" ? "lecturer" : "student"

    async function loadProfile() {
      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("full_name, role, student_number, staff_number, phone_number")
        .eq("id", userId)
        .single()

      if (fetchError?.code === "PGRST116") {
        const { error: insertError } = await supabase
          .from("profiles")
          .upsert({ id: userId, full_name: fallbackName, role: metadataRole })

        if (insertError) {
          setError("Failed to load profile")
          setLoading(false)
          return
        }

        const { data: retryData } = await supabase
          .from("profiles")
          .select("full_name, role, student_number, staff_number, phone_number")
          .eq("id", userId)
          .single()

        if (retryData) applyProfile(retryData)
        setLoading(false)
        return
      }

      if (fetchError) {
        setError("Failed to load profile")
      } else if (data) {
        applyProfile(data)
      }
      setLoading(false)
    }

    function applyProfile(data: ProfileFields) {
      setFullName(data.full_name)
      setRole(data.role)
      setStudentNumber(data.student_number ?? "")
      setStaffNumber(data.staff_number ?? "")
      setPhoneNumber(data.phone_number ?? "")
    }

    loadProfile()
  }, [user])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setError("")
    setSuccess(false)
    setSaving(true)
    try {
      const updates: Record<string, string | null> = {
        full_name: fullName.trim() || null,
        phone_number: phoneNumber.trim() || null,
      }
      if (role === "student") {
        updates.student_number = studentNumber.trim() || null
      } else {
        updates.staff_number = staffNumber.trim() || null
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id)
      if (updateError) throw updateError
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  const isStudent = role === "student"

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>Shown on your attendance records.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-5 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {success && (
            <p className="mb-5 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
              Profile updated.
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label htmlFor="full_name" className="text-sm font-medium">
                    Full name
                  </label>
                  <input
                    id="full_name"
                    required
                    placeholder="Jane Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="id_number" className="text-sm font-medium">
                    {isStudent ? "Student number" : "Staff number"}
                  </label>
                  <input
                    id="id_number"
                    placeholder={isStudent ? "STU-2025-0001" : "LEC-0001"}
                    value={isStudent ? studentNumber : staffNumber}
                    onChange={(e) =>
                      isStudent
                        ? setStudentNumber(e.target.value)
                        : setStaffNumber(e.target.value)
                    }
                    className={inputClass}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="phone_number" className="text-sm font-medium">
                    Phone number
                  </label>
                  <input
                    id="phone_number"
                    type="tel"
                    placeholder="+1 555 000 1234"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs muted-text">Fields left empty are stored as null.</p>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Save data-icon="inline-start" aria-hidden="true" />
                  )}
                  Save changes
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card size="sm" className="hairline-border">
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {(fullName || "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{fullName || "—"}</p>
              <p className="flex items-center gap-1 text-xs muted-text">
                <Mail className="size-3" aria-hidden="true" />
                <span className="truncate">{user?.email}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide muted-text">Role</span>
              <Badge variant="secondary">{role ?? (isStudent ? "student" : "lecturer")}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide muted-text">
                {isStudent ? "Student number" : "Staff number"}
              </span>
              <span className="font-medium">{(isStudent ? studentNumber : staffNumber) || "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide muted-text">Phone</span>
              <span className="font-medium">{phoneNumber || "—"}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}