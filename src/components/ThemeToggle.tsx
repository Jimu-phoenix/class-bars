import { useTheme } from "@/contexts/ThemeContext"
import { Button, buttonVariants } from "@/components/ui/button"
import { THEME_CYCLE, themeIndex } from "@/lib/themeModes"
import type { VariantProps } from "class-variance-authority"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type ThemeToggleProps = {
  className?: string
  variant?: VariantProps<typeof buttonVariants>["variant"]
  size?: VariantProps<typeof buttonVariants>["size"]
  children?: ReactNode
}

export default function ThemeToggle({ className, variant = "outline", size = "icon", children }: ThemeToggleProps) {
  const { theme, cycleTheme } = useTheme()
  const active = THEME_CYCLE[themeIndex(theme)]
  const Icon = active.icon

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={cycleTheme}
      aria-label={`Theme: ${active.label}. Activate to switch to the next mode.`}
      title={`${active.label} theme`}
      className={cn(className)}
    >
      <Icon className="size-4.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">{active.label}</span>
      {children}
    </Button>
  )
}