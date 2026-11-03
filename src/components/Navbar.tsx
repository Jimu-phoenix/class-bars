import { useEffect, useRef, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { ArrowUpRight, Menu, X } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import ThemeToggle from "@/components/ThemeToggle"
import { useRole } from "@/contexts/RoleContext"
import type { UserRole } from "@/types/db"
import { cn } from "@/lib/utils"

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/privacy", label: "Privacy Policy" },
] as const

/**
 * Role-aware dashboard target. While the role is still resolving (or could
 * not be read), fall back to the auth-only /profile page rather than guessing
 * a dashboard — the route guards will correct the destination anyway.
 */
const dashboardPath = (role: UserRole | null) =>
  role === "lecturer" ? "/dashboard" : role === "student" ? "/student" : "/login"

export default function Navbar() {
  const { user, loading, signOut } = useAuth()
  const { role } = useRole()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const closeMenu = () => setOpen(false)

  // Mobile drawer behaviour: lock page scroll, move focus into the drawer,
  // close on Escape, and close if the viewport grows to the desktop layout.
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeButtonRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    const media = window.matchMedia("(min-width: 768px)")
    const onChange = () => {
      if (media.matches) setOpen(false)
    }

    window.addEventListener("keydown", onKeyDown)
    media.addEventListener("change", onChange)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
      media.removeEventListener("change", onChange)
    }
  }, [open])

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <nav
        className="container-default grid h-16 grid-cols-[1fr_auto_1fr] items-center"
        aria-label="Main navigation"
      >
        {/* Left: menu button (mobile) / links (desktop) */}
        <div className="flex items-center">
          <button
            ref={menuButtonRef}
            type="button"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-background transition-colors hover:bg-muted md:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>

          <div className="hidden items-center gap-6 md:flex">
            {navLinks.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "relative py-1.5 text-sm font-medium transition-colors duration-200",
                  location.pathname === to
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={location.pathname === to ? "page" : undefined}
              >
                {label}
                {location.pathname === to && (
                  <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-foreground" />
                )}
              </Link>
            ))}
          </div>
        </div>

        {/* Centre: logo */}
        <Link to="/" className="flex items-center gap-2" aria-label="Class-BARS home">
          <img src="/favicon.svg" alt="" className="h-7 w-7 dark:hidden" aria-hidden="true" />
          <img
            src="/bars_white.svg"
            alt=""
            className="hidden h-10 w-10 dark:block mix-blend-screen"
            aria-hidden="true"
          />
          <span className="font-heading text-sm font-semibold tracking-tight">Class-BARS</span>
        </Link>

        {/* Right: theme + calls to action (desktop) */}
        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <ThemeToggle />

          <div className="hidden items-center gap-2 md:flex">
            {loading ? (
              <div className="h-10 w-24 animate-pulse rounded-full bg-muted" />
            ) : user ? (
              <>
                <Link
                  to={dashboardPath(role)}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-foreground/85"
                >
                  Dashboard
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
                <button
                  onClick={signOut}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-foreground/85"
                >
                  Sign up
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeMenu}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
            className="absolute inset-x-3 top-3 max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl bg-[#101011] pb-[env(safe-area-inset-bottom)] text-white shadow-2xl ring-1 ring-white/10"
          >
            <div className="flex items-center justify-between p-5">
              <Link to="/" onClick={closeMenu} className="flex items-center gap-2.5" aria-label="Class-BARS home">
                <img src="/bars_white.svg" alt="" className="h-8 w-8" aria-hidden="true" />
                <span className="font-heading text-base font-semibold tracking-tight">Class-BARS</span>
              </Link>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close menu"
                onClick={() => {
                  closeMenu()
                  menuButtonRef.current?.focus()
                }}
                className="inline-flex size-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <ul className="px-5 pb-2">
              {navLinks.map(({ to, label }) => (
                <li key={to}>
                  <Link
                    to={to}
                    onClick={closeMenu}
                    aria-current={location.pathname === to ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between rounded-xl py-3.5 text-lg transition-colors focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none",
                      location.pathname === to ? "font-semibold text-white" : "text-white/70 hover:text-white",
                    )}
                  >
                    {label}
                    {location.pathname === to && (
                      <span className="size-1.5 rounded-full bg-white" aria-hidden="true" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mx-5 my-3 border-t border-white/10" />

            <div className="px-3">
              <ThemeToggle
                variant="ghost"
                size="default"
                className="w-full justify-start gap-3 rounded-xl text-base font-medium text-white/70 hover:bg-white/10 hover:text-white"
              >
                <span>Theme</span>
              </ThemeToggle>
            </div>

            <div className="grid gap-3 p-5">
              {loading ? (
                <div className="h-12 animate-pulse rounded-xl bg-white/10" />
              ) : user ? (
                <>
                  <Link
                    to={dashboardPath(role)}
                    onClick={closeMenu}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-neutral-900 transition-colors hover:bg-white/90"
                  >
                    Dashboard
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu()
                      void signOut()
                    }}
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-white/20 text-sm font-medium text-white transition-colors hover:bg-white/10"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/signup"
                    onClick={closeMenu}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-neutral-900 transition-colors hover:bg-white/90"
                  >
                    Sign up
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </Link>
                  <Link
                    to="/login"
                    onClick={closeMenu}
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-white/20 text-sm font-medium text-white transition-colors hover:bg-white/10"
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}