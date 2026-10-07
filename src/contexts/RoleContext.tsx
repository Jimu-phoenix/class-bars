import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase"
import type { UserRole } from "@/types/db"

/**
 * Single source of truth for the signed-in user's role.
 *
 * Trust boundary: the role is read from `public.profiles`, which is written
 * by the `handle_new_user()` signup trigger. `auth.user_metadata` is
 * deliberately NEVER consulted here — it is client-writable and therefore
 * not an authorisation input.
 *
 * Failure policy is fail-closed: any read error, missing row or unexpected
 * value yields `status: "unavailable"` with `role: null`. Callers must deny
 * until they see `status: "ready"`.
 */
export type RoleStatus = "loading" | "ready" | "unavailable"

type RoleContextValue = {
  role: UserRole | null
  status: RoleStatus
}

type ProfileRead = {
  userId: string
  role: UserRole | null
  ok: boolean
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined)

function isUserRole(value: unknown): value is UserRole {
  return value === "student" || value === "lecturer" || value === "admin"
}

function isStale(entry: ProfileRead | null, userId: string | null): boolean {
  return entry === null || entry.userId !== userId
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
  const [read, setRead] = useState<ProfileRead | null>(null)

  useEffect(() => {
    if (authLoading || !userId) return
    let cancelled = false

    supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        // Missing row, read failure or unknown value: deny rather than fall
        // back to client-supplied metadata.
        const ok = !error && !!data && isUserRole(data.role)
        setRead({ userId, role: ok ? data.role : null, ok })
      })

    return () => {
      cancelled = true
    }
  }, [userId, authLoading])

  const value = useMemo<RoleContextValue>(() => {
    if (authLoading) return { role: null, status: "loading" }
    if (!userId) return { role: null, status: "unavailable" }
    if (isStale(read, userId)) return { role: null, status: "loading" }

    const entry = read
    if (entry === null || entry.userId !== userId || !entry.ok || !entry.role) {
      return { role: null, status: "unavailable" }
    }
    return { role: entry.role, status: "ready" }
  }, [authLoading, userId, read])

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRole() {
  const context = useContext(RoleContext)
  if (!context) throw new Error("useRole must be used within a RoleProvider")
  return context
}