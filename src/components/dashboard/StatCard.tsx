import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type StatCardProps = {
  label: string
  hint?: string
  icon: LucideIcon
  value: number | string
  loading?: boolean
  /** Optional classes for the small icon chip, e.g. "bg-emerald-500/10 text-emerald-600" (ignored on highlighted cards) */
  accent?: string
  pulse?: boolean
  /** Lime highlight card. Defaults to true for live (pulsing) cards. */
  highlight?: boolean
}

export default function StatCard({
  label,
  hint,
  icon: Icon,
  value,
  loading,
  accent,
  pulse,
  highlight,
}: StatCardProps) {
  const lime = highlight ?? Boolean(pulse)

  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl p-3.5 sm:rounded-3xl sm:p-5",
        lime ? "bg-[#e4f585] text-neutral-900" : "bg-muted/60 text-foreground",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 text-xs",
          lime ? "text-neutral-700" : "text-muted-foreground",
        )}
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full",
            lime ? "bg-neutral-900/10 text-neutral-900" : cn("bg-background", accent),
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <span className="truncate font-medium">{label}</span>
        {pulse && !loading && (
          <span className="relative ml-auto flex size-2 shrink-0">
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                lime ? "bg-neutral-900" : "bg-emerald-400",
              )}
            />
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                lime ? "bg-neutral-900" : "bg-emerald-500",
              )}
            />
          </span>
        )}
      </div>
      {loading ? (
        <div
          className={cn(
            "mt-3 h-7 w-12 animate-pulse rounded",
            lime ? "bg-neutral-900/15" : "bg-muted",
          )}
          aria-label="Loading"
        />
      ) : (
        <p className="mt-3 truncate text-2xl font-semibold tracking-tight tabular-nums sm:text-4xl">
          {value}
        </p>
      )}
      {hint && (
        <p
          className={cn(
            "mt-1 hidden truncate text-xs sm:block",
            lime ? "text-neutral-700" : "text-muted-foreground",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  )
}