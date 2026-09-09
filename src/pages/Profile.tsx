import { useState, useEffect, useCallback, type FormEvent } from "react"
import { Link, useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import {
  clearFaceEmbedding,
  getActiveFaceEmbedding,
  upsertFaceEmbedding,
} from "@/lib/realAttendance"
import FaceEnrollCard from "@/components/face/FaceEnrollCard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Home,
  User,
  Camera,
  ShieldCheck,
  LogOut,
  Phone,
  Hash,
  Save,
  CheckCircle2,
  Loader2,
  Presentation,
  ScanFace,
  Trash2,
} from "lucide-react"
import type { FaceEmbeddingRow } from "@/types/db"

type ProfileData = {
  full_name: string
  role: string
  student_number: string | null
  staff_number: string | null
  phone_number: string | null
}

export default function Profile() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [studentNumber, setStudentNumber] = useState("")
  const [staffNumber, setStaffNumber] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")

  const [embedding, setEmbedding] = useState<FaceEmbeddingRow | null>(null)
  const [embeddingLoading, setEmbeddingLoading] = useState(false)
  const [embeddingError, setEmbeddingError] = useState("")
  const [embeddingNotice, setEmbeddingNotice] = useState("")
  const [showEnroll, setShowEnroll] = useState(false)

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
    if (!user || profile?.role !== "student") return
    const timer = window.setTimeout(() => void loadEmbedding(), 0)
    return () => window.clearTimeout(timer)
  }, [user, profile?.role, loadEmbedding])

  useEffect(() => {
    const currentUser = user
    if (!currentUser) return

    const userId = currentUser.id
    const fullName =
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
          .upsert({
            id: userId,
            full_name: fullName,
            role: metadataRole,
          })

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

        if (retryData) {
          setProfile(retryData)
          setStudentNumber(retryData.student_number ?? "")
          setStaffNumber(retryData.staff_number ?? "")
          setPhoneNumber(retryData.phone_number ?? "")
        }
        setLoading(false)
        return
      }

      if (fetchError) {
        setError("Failed to load profile")
      } else if (data) {
        setProfile(data)
        setStudentNumber(data.student_number ?? "")
        setStaffNumber(data.staff_number ?? "")
        setPhoneNumber(data.phone_number ?? "")
      }
      setLoading(false)
    }

    loadProfile()
  }, [user])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess(false)
    setSaving(true)
    try {
      const updates: Record<string, string | null> = {}
      if (profile?.role === "student") {
        updates.student_number = studentNumber || null
      } else {
        updates.staff_number = staffNumber || null
      }
      updates.phone_number = phoneNumber || null

      const { error: updateError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user!.id)

      if (updateError) throw updateError
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  const handleFaceSaved = async (descriptor: Float32Array) => {
    await upsertFaceEmbedding(descriptor)
    setShowEnroll(false)
    setEmbeddingNotice("Face template saved.")
    try {
      await loadEmbedding()
    } catch {
      // translated notice above already communicates success
    }
  }

  const handleClearFace = async () => {
    if (!window.confirm("Remove your enrolled face template?")) return
    setEmbeddingNotice("")
    setEmbeddingError("")
    setEmbeddingLoading(true)
    try {
      await clearFaceEmbedding()
      setEmbedding(null)
      setEmbeddingNotice("Face template removed.")
    } catch (err) {
      setEmbeddingError(
        err instanceof Error ? err.message : "Failed to remove face template",
      )
    } finally {
      setEmbeddingLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const roleLabel =
    profile?.role === "lecturer" ? "Lecturer" : profile?.role === "admin" ? "Admin" : "Student"

  const sidebarItems = [
    { label: "Home", href: "/", icon: Home },
    ...(profile?.role === "student"
      ? [{ label: "Live Classes", href: "/student", icon: Presentation }]
      : []),
    { label: "Profile", href: "/profile", icon: User },
    { label: "Face Detection", href: "/face-test", icon: Camera },
    { label: "Face Verification", href: "/face-verify", icon: ShieldCheck },
  ]

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ── */}
      <aside className="hidden w-64 flex-col border-r border-border bg-background p-6 lg:flex">
        <div className="mb-10 flex items-center gap-2 px-2">
          <span className="font-heading text-base font-semibold">Class-BARS</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {sidebarItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                data-active={isActive || undefined}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[active]:bg-muted data-[active]:text-foreground"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <button
          onClick={signOut}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </button>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-1 flex-col">
        {/* ── Top bar (mobile) ── */}
        <header className="flex items-center justify-between border-b border-border px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="font-heading text-base font-semibold">Class-BARS</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm muted-text sm:inline">
              {user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={signOut} className="lg:hidden">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </header>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto px-4 py-10 lg:px-10 lg:py-14">
          <div className="mx-auto max-w-4xl space-y-10">
          {/* Greeting */}
            <div>
              <h1 className="heading-2">
                {profile?.full_name
                  ? `Good to see you, ${profile.full_name.split(" ")[0]}`
                  : "Dashboard"}
              </h1>
              <p className="mt-2 body-lg muted-text">
                Manage your profile and account settings.
              </p>
            </div>

          {/* ── Stats row ── */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="hairline-border">
                <CardContent className="flex items-center gap-4 py-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <User className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs muted-text">Email</p>
                    <p className="truncate text-sm font-medium">{user?.email}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="hairline-border">
                <CardContent className="flex items-center gap-4 py-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs muted-text">Role</p>
                    <Badge variant="outline" className="mt-0.5">
                      {roleLabel}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
              <Card className="hairline-border">
                <CardContent className="flex items-center gap-4 py-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Hash className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs muted-text">
                      {profile?.role === "lecturer" ? "Staff number" : "Student number"}
                    </p>
                    <p className="truncate text-sm font-medium">
                      {profile?.role === "lecturer"
                        ? profile?.staff_number || "—"
                        : profile?.student_number || "—"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

{/* ── Profile settings ── */}
            <Card className="hairline-border">
              <CardHeader>
                <CardTitle>Profile settings</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      <span>{error}</span>
                    </div>
                  )}
                  {success && (
                    <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-300">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      <span>Profile updated successfully</span>
                    </div>
                  )}

                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Full name</label>
                      <div className="input-radius border border-input bg-muted px-3 py-2.5 text-sm muted-text">
                        {profile?.full_name || "—"}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Email</label>
                      <div className="input-radius border border-input bg-muted px-3 py-2.5 text-sm muted-text">
                        {user?.email}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    {profile?.role === "student" ? (
                      <div className="space-y-1.5">
                        <label htmlFor="studentNumber" className="text-sm font-medium">
                          Student number
                        </label>
                        <div className="relative">
                          <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 muted-text" aria-hidden="true" />
                          <input
                            id="studentNumber"
                            type="text"
                            value={studentNumber}
                            onChange={(e) => setStudentNumber(e.target.value)}
                            placeholder="e.g. STU-2024-001"
                            className="w-full input-radius border border-input bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 transition-colors"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <label htmlFor="staffNumber" className="text-sm font-medium">
                          Staff number
                        </label>
                        <div className="relative">
                          <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 muted-text" aria-hidden="true" />
                          <input
                            id="staffNumber"
                            type="text"
                            value={staffNumber}
                            onChange={(e) => setStaffNumber(e.target.value)}
                            placeholder="e.g. LEC-2024-001"
                            className="w-full input-radius border border-input bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 transition-colors"
                          />
                        </div>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label htmlFor="phoneNumber" className="text-sm font-medium">
                        Phone number
                      </label>
                      <div className="relative">
                        <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 muted-text" aria-hidden="true" />
                        <input
                          id="phoneNumber"
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="+1 (555) 000-0000"
                          className="w-full input-radius border border-input bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border-t border-border pt-6">
                    <Button type="submit" disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" aria-hidden="true" />
                          Save changes
                        </>
                      )}
                    </Button>
                    {success && (
                      <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        Saved
                      </span>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

          {/* ── Face biometrics ── */}
          {profile?.role === "student" && (
            <Card className="hairline-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ScanFace className="size-4 text-primary" aria-hidden="true" />
                  Face biometrics
                </CardTitle>
                <CardDescription>
                  Your face template is used to verify you when joining live classes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {embeddingLoading ? (
                  <p className="flex items-center gap-2 text-sm muted-text">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Checking…
                  </p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {embedding ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge>Enrolled</Badge>
                        <span className="muted-text">
                          {embedding.model_version} · saved{" "}
                          {new Date(embedding.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm muted-text">
                        No face template yet — add one to check into live classes.
                      </p>
                    )}
                    {embeddingError && (
                      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {embeddingError}
                      </p>
                    )}
                    {embeddingNotice && (
                      <p className="flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-300">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        {embeddingNotice}
                      </p>
                    )}
                    {!showEnroll && (
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          size="sm"
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
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleClearFace()}
                            disabled={embeddingLoading}
                          >
                            <Trash2 data-icon="inline-start" aria-hidden="true" />
                            Remove
                          </Button>
                        )}
                      </div>
                    )}
                    {showEnroll && (
                      <div className="rounded-xl border border-border p-4">
                        <FaceEnrollCard
                          actionLabel="Save face template"
                          onSave={handleFaceSaved}
                          onCancel={() => setShowEnroll(false)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Quick links ── */}
            <Card className="hairline-border">
              <CardHeader>
                <CardTitle>Quick access</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                {profile?.role === "student" && (
                  <Link
                    to="/student"
                    className="flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted"
                  >
                    <Presentation className="h-5 w-5 text-primary" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium">Live Classes</p>
                      <p className="text-xs muted-text">
                        See live sessions and check in
                      </p>
                    </div>
                  </Link>
                )}
                <Link
                    to="/face-test"
                    className="flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted"
                  >
                    <Camera className="h-5 w-5 text-primary" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium">Face Detection</p>
                      <p className="text-xs muted-text">
                        Test live face detection
                      </p>
                    </div>
                  </Link>
                  <Link
                    to="/face-verify"
                    className="flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted"
                  >
                    <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium">Face Verification</p>
                      <p className="text-xs muted-text">
                        Register and verify faces
                      </p>
                    </div>
                  </Link>
                </div>
              </CardContent>
            </Card>
      </div>
    </div>
  </div>
</div>
  )
}
