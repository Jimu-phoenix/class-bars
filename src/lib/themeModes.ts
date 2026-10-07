import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react"
import type { Theme } from "@/lib/themeUtils"

/**
 * Ordered light → dark → system to match the cycle performed by
 * `cycleTheme()`. Kept in its own module so pure-theming helpers can reuse
 * it without tripping react-refresh's single-component-export rule.
 */
export const THEME_CYCLE: readonly {
  theme: Theme
  label: string
  icon: LucideIcon
}[] = [
  { theme: "light", label: "Light", icon: Sun },
  { theme: "dark", label: "Dark", icon: Moon },
  { theme: "system", label: "System", icon: Monitor },
]

export function themeIndex(theme: Theme): number {
  const index = THEME_CYCLE.findIndex((mode) => mode.theme === theme)
  return index >= 0 ? index : 0
}