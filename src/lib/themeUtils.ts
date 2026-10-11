export type Theme = "light" | "dark" | "system"

export const THEMES: readonly Theme[] = ["light", "dark", "system"]
export const THEME_STORAGE_KEY = "theme"
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)"

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system"
}

export function prefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false
  }
  return window.matchMedia(DARK_MEDIA_QUERY).matches
}

export function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system"
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(stored) ? stored : "system"
  } catch {
    return "system"
  }
}

export function resolveTheme(theme: Theme, systemDark: boolean): "light" | "dark" {
  if (theme === "system") return systemDark ? "dark" : "light"
  return theme
}

export function nextTheme(theme: Theme): Theme {
  if (theme === "light") return "dark"
  if (theme === "dark") return "system"
  return "light"
}