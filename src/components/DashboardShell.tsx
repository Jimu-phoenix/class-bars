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

/*
 * Visual language: a dark, floating navigation rail (always dark, in both
 * themes, so it contrasts with the light canvas) with a lime accent for the
 * active item, set against a soft grey canvas and a rounded content panel.
 */
const sidebarItemClass = ({ isActive }: { isActive: boolean }, collapsed: boolean) =>
  cn(
    "group flex items-center gap-3 rounded-2xl text-sm font-medium outline-none transition-colors",
    "focus-visible:ring-2 focus-visible:ring-[#e4f585]/70",
    collapsed ? "size-11 justify-center self-center" : "px-3.5 py-2.5",
    isActive
      ? "bg-[#e4f585] font-semibold text-neutral-900 shadow-[0_0_0_1px_rgba(228,245,133,0.35)]"
      : "text-white/60 hover:bg-white/10 hover:text-white",
  )

const railButtonClass = (collapsed: boolean) =>
  cn(
    "w-full justify-start gap-3 rounded-2xl text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white",
    "focus-visible:ring-2 focus-visible:ring-[#e4f585]/70",
    collapsed && "size-11 justify-center self-center px-0",
  )

const tabItemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none transition-colors",
    isActive ? "text-white" : "text-white/60",
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

/** Logo chip for the always-dark sidebar (white icon on a translucent tile). */
function SidebarLogo() {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
      <img src="/bars_white.svg" alt="" className="h-6 w-6" aria-hidden="true" />
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
    <div className="flex min-h-dvh bg-muted/70 lg:gap-3 lg:p-3">
      {/* Desktop sidebar: floating dark rail */}
      <aside
        className={cn(
          "sticky top-3 hidden h-[calc(100dvh-1.5rem)] shrink-0 flex-col rounded-[28px] bg-[#0f0f10] text-white shadow-xl shadow-black/20 transition-[width] duration-200 ease-in-out lg:flex",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center gap-3 px-4 pt-5 pb-3",
            collapsed && "justify-center px-0",
          )}
        >
          <SidebarLogo />
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-heading truncate text-sm leading-none font-semibold text-white">
                Class-BARS
              </p>
              <Badge variant="secondary" className="mt-1.5 border-0 bg-white/10 text-white/80">
                {roleLabel}
              </Badge>
            </div>
          )}
        </div>

        <nav
          aria-label="Primary"
          className={cn(
            "flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-4",
            collapsed && "items-center px-0",
          )}
        >
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
              className={(state) => sidebarItemClass(state, collapsed)}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div
          className={cn(
            "flex flex-col gap-1.5 border-t border-white/10 px-3 py-3",
            collapsed && "items-center px-0",
          )}
        >
          <Button
            variant="ghost"
            aria-label={collapsed ? "Sign out" : undefined}
            title={collapsed ? "Sign out" : undefined}
            className={cn(railButtonClass(collapsed), "hover:bg-red-500/15 hover:text-red-300")}
            onClick={() => void handleSignOut()}
          >
            <LogOut className="size-5 shrink-0" aria-hidden="true" />
            {!collapsed && <span>Sign out</span>}
          </Button>
          <ThemeToggle variant="ghost" size="default" className={railButtonClass(collapsed)}>
            {!collapsed && <span className="truncate text-sm font-medium">Theme</span>}
          </ThemeToggle>
          <Button
            variant="ghost"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={railButtonClass(collapsed)}
            onClick={toggleCollapsed}
          >
            {collapsed ? (
              <ChevronsRight className="size-5 shrink-0" aria-hidden="true" />
            ) : (
              <>
                <ChevronsLeft className="size-5 shrink-0" aria-hidden="true" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </aside>

      {/* Content panel */}
      <div className="flex min-w-0 flex-1 flex-col bg-background lg:rounded-[28px]">
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

        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 lg:pb-8">
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

      {/* Mobile bottom tab bar: floating dark pill matching the desktop rail */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-3xl bg-[#0f0f10] px-1.5 shadow-xl shadow-black/30 lg:hidden"
      >
        <ul
          className="grid"
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
                        isActive && "bg-[#e4f585] text-neutral-900",
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