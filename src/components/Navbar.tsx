import { Link, useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useTheme } from "@/contexts/ThemeContext"
import { cn } from "@/lib/utils"
import { Sun, Moon, Monitor } from "lucide-react"
import { useState, useRef, useEffect } from "react"

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/privacy", label: "Privacy Policy" },
] as const

const themeOptions = [
  { value: "light", label: "Light", icon: Sun } as const,
  { value: "dark", label: "Dark", icon: Moon } as const,
  { value: "system", label: "System", icon: Monitor } as const,
]

export default function Navbar() {
  const { user, loading, signOut } = useAuth()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const location = useLocation()
  const [themeOpen, setThemeOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setThemeOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                aria-label="Theme"
                aria-haspopup="listbox"
                aria-expanded={themeOpen}
                onClick={() => setThemeOpen(!themeOpen)}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50"
              >
                {resolvedTheme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              </button>
              {themeOpen && (
                <ul
                  role="listbox"
                  aria-label="Select theme"
                  className="absolute right-0 mt-2 w-36 origin-top-right rounded-md border border-border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
                >
                  {themeOptions.map(({ value, label, icon: Icon }) => (
                    <li key={value}>
                      <button
                        role="option"
                        aria-selected={theme === value}
                        onClick={() => {
                          setTheme(value)
                          setThemeOpen(false)
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors",
                          theme === value
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {label}
                        {theme === value && <span className="ml-auto text-primary">✓</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {loading ? (
              <div className="h-10 w-24 animate-pulse rounded-md bg-muted" />
            ) : user ? (
              <>
                <Link
                  to={user.user_metadata?.role === "lecturer" ? "/dashboard" : "/student"}
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