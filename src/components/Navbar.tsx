import { Link, useLocation } from "react-router-dom"
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
  role === "lecturer" ? "/dashboard" : role === "student" ? "/student" : "/profile"

export default function Navbar() {
  const { user, loading, signOut } = useAuth()
  const { role } = useRole()
  const location = useLocation()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
      <nav className="container-default flex h-16 items-center justify-between" aria-label="Main navigation">
        <Link to="/" className="flex items-center" aria-label="Class-BARS home">
          <span className="sr-only">Class-BARS</span>
          <img
            src="/favicon.svg"
            alt=""
            className="h-8 w-8 dark:hidden"
            aria-hidden="true"
          />
          <img
            src="/bars_white.svg"
            alt=""
            className="hidden h-12 w-12 dark:block mix-blend-screen"
            aria-hidden="true"
          />
        </Link>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "relative text-sm font-medium px-2 py-1.5 rounded-md transition-all duration-200",
                  location.pathname === to
                    ? "text-foreground bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                aria-current={location.pathname === to ? "page" : undefined}
              >
                {label}
                {location.pathname === to && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-4 bg-primary rounded-full" />
                )}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />

            {loading ? (
              <div className="h-10 w-24 animate-pulse rounded-md bg-muted" />
            ) : user ? (
              <>
                <Link
                  to={dashboardPath(role)}
                  className="hidden sm:inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Dashboard
                </Link>
                <button
                  onClick={signOut}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden sm:inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>
    </header>
  )
}