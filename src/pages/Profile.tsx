import { useState, useEffect, type FormEvent } from "react"
import { Link, useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  Palette,
} from "lucide-react"

const navItems = [
  { label: "Home", href: "/", icon: Home },
  { label: "Profile", href: "/profile", icon: User },
  { label: "Face Detection", href: "/face-test", icon: Camera },
  { label: "Face Verification", href: "/face-verify", icon: ShieldCheck },
]

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const roleLabel =
    profile?.role === "lecturer" ? "Lecturer" : profile?.role === "admin" ? "Admin" : "Student"

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ── */}
      <aside className="hidden w-64 flex-col border-r border-border bg-sidebar p-4 lg:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <Palette className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">Class-BARS</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                data-active={isActive || undefined}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active]:bg-sidebar-accent data-[active]:text-sidebar-accent-foreground"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <button
          onClick={signOut}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-1 flex-col">
        {/* ── Top bar (mobile) ── */}
        <header className="flex items-center justify-between border-b border-border px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <Palette className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">Class-BARS</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={signOut} className="lg:hidden">
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </header>

        {/* ── Content ── */}
        <div className="flex-1 space-y-8 overflow-y-auto px-4 py-8 lg:px-8">
          {/* Greeting */}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {profile?.full_name
                ? `Good to see you, ${profile.full_name.split(" ")[0]}`
                : "Dashboard"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your profile and account settings.
            </p>
          </div>

          {/* ── Stats row ── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-4 py-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="truncate text-sm font-medium">{user?.email}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 py-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Role</p>
                  <Badge variant="outline" className="mt-0.5">
                    {roleLabel}
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card className="sm:col-span-2 lg:col-span-1">
              <CardContent className="flex items-center gap-4 py-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Hash className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
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
          <Card>
            <CardHeader>
              <CardTitle>Profile settings</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <span>{error}</span>
                  </div>
                )}
                {success && (
                  <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-300">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Profile updated successfully</span>
                  </div>
                )}

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Full name</label>
                    <div className="rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {profile?.full_name || "—"}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Email</label>
                    <div className="rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {user?.email}
                    </div>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  {profile?.role === "student" ? (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="studentNumber" className="text-sm font-medium">
                        Student number
                      </label>
                      <div className="relative">
                        <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          id="studentNumber"
                          type="text"
                          value={studentNumber}
                          onChange={(e) => setStudentNumber(e.target.value)}
                          placeholder="e.g. STU-2024-001"
                          className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="staffNumber" className="text-sm font-medium">
                        Staff number
                      </label>
                      <div className="relative">
                        <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          id="staffNumber"
                          type="text"
                          value={staffNumber}
                          onChange={(e) => setStaffNumber(e.target.value)}
                          placeholder="e.g. LEC-2024-001"
                          className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="phoneNumber" className="text-sm font-medium">
                      Phone number
                    </label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="phoneNumber"
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="+1 (555) 000-0000"
                        className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 border-t border-border pt-5">
                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Save changes
                      </>
                    )}
                  </Button>
                  {success && (
                    <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Saved
                    </span>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          {/* ── Quick links ── */}
          <Card>
            <CardHeader>
              <CardTitle>Quick access</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <Link
                  to="/face-test"
                  className="flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted"
                >
                  <Camera className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Face Detection</p>
                    <p className="text-xs text-muted-foreground">
                      Test live face detection
                    </p>
                  </div>
                </Link>
                <Link
                  to="/face-verify"
                  className="flex items-center gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted"
                >
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Face Verification</p>
                    <p className="text-xs text-muted-foreground">
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
  )
}
