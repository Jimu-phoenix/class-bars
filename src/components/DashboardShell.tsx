import { useState, type ReactNode } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useRole } from "@/contexts/RoleContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import ThemeToggle from "@/components/ThemeToggle"
import { cn } from "@/lib/utils"
import { LECTURER_NAV, STUDENT_NAV, ADMIN_NAV, type NavItem } from "@/lib/nav"

const SIDEBAR_STORAGE_KEY = "class-bars:sidebar-collapsed"

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

type DashboardShellProps = {
  title?: string
  description?: string
  children: ReactNode
}

const sidebarItemClass = ({ isActive }: { isActive: boolean }, collapsed: boolean) =>
  cn(
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
    collapsed && "justify-center px-0",
    isActive
      ? "bg-primary/10 font-semibold text-primary"
      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
  )

const tabItemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
    isActive ? "text-foreground" : "text-muted-foreground",
  )

function LogoMark() {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <img src="/favicon.svg" alt="" className="h-5 w-5 dark:hidden" aria-hidden="true" />
      <img
        src="/bars_white.svg"
        alt=""
        className="hidden h-5 w-5 mix-blend-screen dark:block"
        aria-hidden="true"
      />
    </span>
  )
}

export default function DashboardShell({ title, description, children }: DashboardShellProps) {
  const { signOut } = useAuth()
  // The shell derives its identity and navigation from the authoritative
  // profile role rather than trusting caller-supplied props, so a page can
  // never masquerade as the other role's dashboard.
  const { role } = useRole()
  const isLecturer = role === "lecturer"
  const isAdmin = role === "admin"
  const roleLabel = isLecturer ? "Lecturer dashboard" : isAdmin ? "Admin dashboard" : "Student dashboard"
  const navItems: NavItem[] = isLecturer ? LECTURER_NAV : isAdmin ? ADMIN_NAV : STUDENT_NAV
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const handleSignOut = async () => {
    try {
      await signOut()
    } finally {
      navigate("/login")
    }
  }

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, prev ? "0" : "1")
      } catch {
        // storage unavailable (private mode) — preference just won't persist
      }
      return !prev
    })
  }

  return (
    <div className="flex min-h-dvh bg-muted/30">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 ease-in-out lg:flex",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
          <LogoMark />
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-heading truncate text-sm leading-none font-semibold">Class-BARS</p>
              <Badge variant="secondary" className="mt-1.5">
                {roleLabel}
              </Badge>
            </div>
          )}
        </div>

        <nav aria-label="Primary" className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-4">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
              className={(state) => sidebarItemClass(state, collapsed)}
            >
              <Icon className="size-4.5 shrink-0" aria-hidden="true" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-1 border-t border-border px-3 py-3">
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start gap-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
              collapsed && "justify-center px-0",
            )}
            onClick={() => void handleSignOut()}
          >
            <LogOut className="size-4.5 shrink-0" aria-hidden="true" />
            {!collapsed && <span>Sign out</span>}
          </Button>
          <ThemeToggle
            variant="ghost"
            size="default"
            className={cn(
              "w-full justify-start gap-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            {!collapsed && (
              <span className="truncate text-sm font-medium text-muted-foreground">Theme</span>
            )}
          </ThemeToggle>
          <Button
            variant="ghost"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "w-full justify-start gap-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
            onClick={toggleCollapsed}
          >
            {collapsed ? (
              <ChevronsRight className="size-4.5 shrink-0" aria-hidden="true" />
            ) : (
              <>
                <ChevronsLeft className="size-4.5 shrink-0" aria-hidden="true" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
          <div className="flex h-14 items-center gap-2.5">
            <LogoMark />
            <span className="font-heading text-sm font-semibold">Class-BARS</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle variant="ghost" size="icon-sm" />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Sign out"
              onClick={() => void handleSignOut()}
            >
              <LogOut aria-hidden="true" />
            </Button>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 lg:pb-8">
          {(title || description) && (
            <div className="space-y-1">
              {title && (
                <h1 className="font-heading text-2xl font-medium tracking-tight text-balance lg:text-3xl">
                  {title}
                </h1>
              )}
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul
          className="mx-auto grid max-w-md"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={tabItemClass}>
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                        isActive && "bg-primary/10",
                      )}
                    >
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
