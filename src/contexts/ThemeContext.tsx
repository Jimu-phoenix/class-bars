import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  THEME_STORAGE_KEY,
  isTheme,
  nextTheme,
  prefersDark,
  readStoredTheme,
  resolveTheme,
  type Theme,
} from "@/lib/themeUtils"

interface ThemeContextType {
  theme: Theme
  resolvedTheme: "light" | "dark"
  setTheme: (theme: Theme) => void
  cycleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)"

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)
  const [systemDark, setSystemDark] = useState<boolean>(prefersDark)

  const resolvedTheme = resolveTheme(theme, systemDark)

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Storage unavailable (private mode / sandboxed frame) — theme still applies for this session.
    }
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", resolvedTheme === "dark")
    root.classList.toggle("light", resolvedTheme === "light")
  }, [resolvedTheme])

  useEffect(() => {
    if (theme !== "system") return
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return

    const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY)
    const handleChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme])

  const setTheme = useMemo(
    () => (next: Theme) => setThemeState(isTheme(next) ? next : "system"),
    [],
  )
  const cycleTheme = useMemo(() => () => setThemeState((current) => nextTheme(current)), [])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, cycleTheme }),
    [theme, resolvedTheme, setTheme, cycleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}