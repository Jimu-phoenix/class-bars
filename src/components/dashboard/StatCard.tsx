import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type StatCardProps = {
  label: string
  hint?: string
  icon: LucideIcon
  value: number | string
  loading?: boolean
  /** Optional classes for the small icon chip, e.g. "bg-emerald-500/10 text-emerald-600" */
  accent?: string
  pulse?: boolean
}

export default function StatCard({
  label,
  hint,
  icon: Icon,
  value,
  loading,
  accent,
  pulse,
}: StatCardProps) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md bg-muted",
            accent,
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <span className="truncate">{label}</span>
        {pulse && !loading && (
          <span className="relative ml-auto flex size-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
        )}
      </div>
      {loading ? (
        <div className="mt-2.5 h-6 w-10 animate-pulse rounded bg-muted" aria-label="Loading" />
      ) : (
        <p className="mt-2 truncate text-lg font-semibold tracking-tight tabular-nums sm:text-2xl">
          {value}
        </p>
      )}
      {hint && <p className="mt-0.5 hidden truncate text-xs text-muted-foreground sm:block">{hint}</p>}
    </div>
  )
}
