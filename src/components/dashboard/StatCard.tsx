import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type StatCardProps = {
  label: string
  hint?: string
  icon: LucideIcon
  value: number | string
  loading?: boolean
  tone?: "lime" | "green"
  /** Backward compatibility: maps to tone "lime". */
  highlight?: boolean
  /** Backward compatibility: ignored. */
  accent?: string
  pulse?: boolean
}

export default function StatCard({
  label,
  hint,
  icon: Icon,
  value,
  loading,
  tone,
  highlight,
  pulse,
}: StatCardProps) {
  const resolvedTone = highlight ? "lime" : tone
  const toned = resolvedTone === "lime" || resolvedTone === "green"

  const fill =
    resolvedTone === "lime"
      ? "bg-[#e4f585] text-neutral-900"
      : resolvedTone === "green"
        ? "bg-emerald-400 text-neutral-950"
        : "bg-muted/60 text-foreground"

  return (
    <div className={cn("min-w-0 rounded-2xl p-3.5 sm:rounded-3xl sm:p-5", fill)}>
      <div className="flex items-center gap-2 text-xs">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full",
            toned ? "bg-neutral-900/10 text-neutral-900" : "bg-background",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <span
          className={cn(
            "truncate font-medium",
            toned ? "text-neutral-700" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        {pulse && !loading && (
          <span className="relative ml-auto flex size-2 shrink-0">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neutral-900 opacity-75"
            />
            <span className="relative inline-flex size-2 rounded-full bg-neutral-900" />
          </span>
        )}
      </div>
      {loading ? (
        <div className="mt-3 h-7 w-12 animate-pulse rounded bg-neutral-900/15" aria-label="Loading" />
      ) : (
        <p className="mt-3 truncate text-2xl font-semibold tracking-tight tabular-nums sm:text-4xl">
          {value}
        </p>
      )}
      {hint && (
        <p
          className={cn(
            "mt-1 hidden truncate text-xs sm:block",
            toned ? "text-neutral-700" : "text-muted-foreground",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  )
}
