import { useState, type ReactNode } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import {
  ChevronsLeft,
  ChevronsRight,
  GraduationCap,
  LogOut,
  Menu,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { LECTURER_NAV, type NavItem } from "@/lib/nav"

const SIDEBAR_STORAGE_KEY = "class-bars:sidebar-collapsed"

type DashboardShellProps = {
  roleLabel?: string
  navItems?: NavItem[]
  title?: string
  description?: string
  children: ReactNode
}

const navItemClass = ({ isActive }: { isActive: boolean }, collapsed: boolean) =>
  cn(
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
    collapsed && "justify-center px-0",
    isActive
      ? "bg-primary/10 font-semibold text-primary"
      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
  )

export default function DashboardShell({
  roleLabel = "Lecturer dashboard",
  navItems = LECTURER_NAV,
  title,
  description,
  children,
}: DashboardShellProps) {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1",
  )
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleSignOut = async () => {
    try {
      await signOut()
    } finally {
      navigate("/login")
    }
  }

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, prev ? "0" : "1")
      return !prev
    })
  }

  const navLinks = (closeMobile: boolean) =>
    navItems.map(({ to, label, icon: Icon, end }) => (
      <NavLink
        key={to}
        to={to}
        end={end}
        title={collapsed ? label : undefined}
        aria-label={collapsed ? label : undefined}
        className={(state) => navItemClass(state, collapsed)}
        onClick={() => {
          if (closeMobile) setMobileOpen(false)
        }}
      >
        <Icon className="size-4.5 shrink-0" aria-hidden="true" />
        {!collapsed && <span className="truncate">{label}</span>}
      </NavLink>
    ))

  const signOutButton = (
    <Button
      variant="ghost"
      className={cn(
        "justify-start gap-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
        collapsed && "justify-center px-0",
      )}
      onClick={() => void handleSignOut()}
    >
      <LogOut className="size-4.5 shrink-0" aria-hidden="true" />
      {!collapsed && <span>Sign out</span>}
    </Button>
  )

  const desktopSidebar = (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen flex-col border-r border-border bg-background transition-[width] duration-200 ease-in-out lg:flex",
        collapsed ? "w-[76px]" : "w-64",
      )}
    >
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GraduationCap className="size-5" aria-hidden="true" />
        </span>
        {!collapsed && (
          <div className="min-w-0 space-y-0.5">
            <p className="font-heading truncate text-sm leading-none font-semibold">Class-BARS</p>
            <Badge variant="secondary" className="mt-1.5">
              {roleLabel}
            </Badge>
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-4">
        {navLinks(false)}
      </nav>

      <div className="space-y-1 border-t border-border px-3 py-3">
        <div className="w-full">{signOutButton}</div>
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
  )

  const mobileDrawer = mobileOpen && (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Close menu"
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        onClick={() => setMobileOpen(false)}
      />
      <aside className="relative flex h-full w-72 flex-col border-r border-border bg-background shadow-2xl">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="font-heading truncate text-sm leading-none font-semibold">Class-BARS</p>
            <Badge variant="secondary" className="mt-1.5">
              {roleLabel}
            </Badge>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-4">{navLinks(true)}</nav>
        <div className="space-y-1 border-t border-border px-3 py-3">
          <div className="w-full">{signOutButton}</div>
        </div>
      </aside>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-muted/30">
      {desktopSidebar}
      {mobileDrawer}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:hidden">
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu aria-hidden="true" />
          </Button>
          <span className="font-heading text-sm font-semibold">Class-BARS</span>
        </header>

        <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
          {(title || description) && (
            <div className="space-y-1">
              {title && <h1 className="heading-2">{title}</h1>}
              {description && <p className="body-lg muted-text">{description}</p>}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}