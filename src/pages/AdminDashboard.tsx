import { useCallback, useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import { Plus, Trash2, LayoutDashboard, Building2, ShieldCheck, BookOpen, UserRound } from "lucide-react"
import StatCard from "@/components/dashboard/StatCard"
import DashboardShell from "@/components/DashboardShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import type { StaffEmailRow, VenueRow } from "@/types/db"

const ROOT = "/admin"

/* ---------------------------------------------------------------- */
/* Home section                                                     */
/* ---------------------------------------------------------------- */

function AdminHome() {
  const [stats, setStats] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(async () => {
    const [users, venues, sessions] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("venues").select("id", { count: "exact", head: true }),
      supabase.from("class_sessions").select("id", { count: "exact", head: true }),
    ])
    setStats({
      users: users.count ?? 0,
      venues: venues.count ?? 0,
      sessions: sessions.count ?? 0,
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard
        icon={LayoutDashboard}
        label="Sessions"
        value={stats.sessions?.toString() ?? "—"}
        hint={loading ? "Loading…" : "Total class sessions"}
      />
      <StatCard
        icon={UserRound}
        label="Users"
        value={stats.users?.toString() ?? "—"}
        hint={loading ? "Loading…" : "Total user profiles"}
      />
      <StatCard
        icon={Building2}
        label="Venues"
        value={stats.venues?.toString() ?? "—"}
        hint={loading ? "Loading…" : "Total venues"}
      />
    </div>
  )
}

/* ---------------------------------------------------------------- */
/* Venues section                                                   */
/* ---------------------------------------------------------------- */

function AdminVenues() {
  const [venues, setVenues] = useState<VenueRow[]>([])
  const [newName, setNewName] = useState("")
  const [newBuilding, setNewBuilding] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const loadVenues = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("venues")
      .select("id, name, building")
      .order("name", { ascending: true })
    if (fetchError) {
      setError(fetchError.message)
      return
    }
    setVenues((data ?? []) as VenueRow[])
  }, [])

  useEffect(() => {
    void loadVenues()
  }, [loadVenues])

  const addVenue = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const { error: insertError } = await supabase
        .from("venues")
        .insert({ name: newName.trim(), building: newBuilding.trim() || null })
      if (insertError) throw insertError
      setNewName("")
      setNewBuilding("")
      void loadVenues()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add venue")
    } finally {
      setLoading(false)
    }
  }

  const deleteVenue = async (id: string) => {
    if (!window.confirm("Delete this venue?")) return
    const { error: delError } = await supabase.from("venues").delete().eq("id", id)
    if (delError) {
      setError(delError.message)
      return
    }
    void loadVenues()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Venues
        </CardTitle>
        <CardDescription>
          Add and remove venues used when scheduling sessions.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <form onSubmit={addVenue} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label htmlFor="venue-name" className="text-sm font-medium">
                Venue name
              </label>
              <Input
                id="venue-name"
                type="text"
                required
                placeholder="LT1"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="venue-building" className="text-sm font-medium">
                Building
              </label>
              <Input
                id="venue-building"
                type="text"
                placeholder="Main Block"
                value={newBuilding}
                onChange={(e) => setNewBuilding(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={loading || !newName.trim()} className="w-full">
                {loading ? "Adding…" : <><Plus className="mr-2 h-4 w-4" /> Add venue</>}
              </Button>
            </div>
          </div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Existing venues
            </p>
            {venues.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No venues configured.</p>
            ) : (
              <ul className="space-y-1">
                {venues.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between px-3 py-2 rounded-md border border-border text-sm"
                  >
                    <span className="font-medium">{v.name}</span>
                    <div className="flex items-center gap-2">
                      {v.building && <span className="text-xs text-muted-foreground">{v.building}</span>}
                      <Button
                        variant="destructive"
                        size="icon-sm"
                        onClick={() => void deleteVenue(v.id)}
                        aria-label={`Delete ${v.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/* ---------------------------------------------------------------- */
/* Users & Roles section                                            */
/* ---------------------------------------------------------------- */

function AdminUsers() {
  const [emails, setEmails] = useState<StaffEmailRow[]>([])
  const [newEmail, setNewEmail] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const loadEmails = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("staff_emails")
      .select("email, created_at")
      .order("created_at", { ascending: false })
    if (fetchError) {
      setError(fetchError.message)
      return
    }
    setEmails((data ?? []) as StaffEmailRow[])
  }, [])

  useEffect(() => {
    void loadEmails()
  }, [loadEmails])

  const addEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const { error: insertError } = await supabase
        .from("staff_emails")
        .insert({ email: newEmail.trim().toLowerCase() })
      if (insertError) throw insertError
      setNewEmail("")
      void loadEmails()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add email")
    } finally {
      setLoading(false)
    }
  }

  const deleteEmail = async (email: string) => {
    if (!window.confirm(`Remove ${email} from the staff allowlist?`)) return
    const { error: delError } = await supabase.from("staff_emails").delete().eq("email", email)
    if (delError) {
      setError(delError.message)
      return
    }
    void loadEmails()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Users & Roles
        </CardTitle>
        <CardDescription>
          Manage staff emails allowed to register as lecturers.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <form onSubmit={addEmail} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label htmlFor="staff-email" className="text-sm font-medium">
                Staff email
              </label>
              <Input
                id="staff-email"
                type="email"
                required
                placeholder="lecturer@example.edu"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={loading || !newEmail.trim()}
                className="w-full"
              >
                {loading ? "Adding…" : <><Plus className="mr-2 h-4 w-4" /> Add lecturer email</>}
              </Button>
            </div>
          </div>
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Allowed staff emails
            </p>
            {emails.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No staff emails configured.</p>
            ) : (
              <ul className="space-y-1">
                {emails.map((row) => (
                  <li
                    key={row.email}
                    className="flex items-center justify-between px-3 py-2 rounded-md border border-border text-sm"
                  >
                    <span className="font-medium">{row.email}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(row.created_at).toLocaleDateString()}
                      </span>
                      <Button
                        variant="destructive"
                        size="icon-sm"
                        onClick={() => void deleteEmail(row.email)}
                        aria-label={`Remove ${row.email}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/* ---------------------------------------------------------------- */
/* System Logs section                                              */
/* ---------------------------------------------------------------- */

function AdminLogs() {
  const [logs, setLogs] = useState<{ action: string; entity_type: string; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)

  const loadLogs = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("audit_logs")
      .select("action, entity_type, created_at")
      .order("created_at", { ascending: false })
      .limit(50)
    if (fetchError) {
      setLoading(false)
      return
    }
    setLogs((data ?? []) as { action: string; entity_type: string; created_at: string }[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          System Logs
        </CardTitle>
        <CardDescription>
          Recent system audit events.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <p className="text-sm text-muted-foreground italic">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No audit events recorded.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2">Time</th>
                <th className="pb-2">Action</th>
                <th className="pb-2">Entity</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={`${log.created_at}-${log.action}`} className="border-t border-border">
                  <td className="py-2 text-muted-foreground">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="py-2 font-medium">{log.action}</td>
                  <td className="py-2 text-muted-foreground">{log.entity_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------------------------------------------------------- */
/* AdminDashboard                                                   */
/* ---------------------------------------------------------------- */

export default function AdminDashboard() {
  const location = useLocation()
  const activeTab = location.pathname || ROOT

  return (
    <DashboardShell title="Admin dashboard" description="System administration">
      <div className="space-y-6">
        {/* Home */}
        {activeTab === ROOT && <AdminHome />}

        {/* Venues */}
        {activeTab === "/admin/venues" && <AdminVenues />}

        {/* Users & Roles */}
        {activeTab === "/admin/users" && <AdminUsers />}

        {/* System Logs */}
        {activeTab === "/admin/logs" && <AdminLogs />}

      </div>
    </DashboardShell>
  )
}
