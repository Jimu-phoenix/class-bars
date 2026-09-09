import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type StatCardProps = {
  label: string
  hint: string
  icon: LucideIcon
  value: number | string
  loading?: boolean
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
    <Card className="hairline-border">
      <CardContent className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold tracking-wide uppercase muted-text">{label}</p>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {loading ? "—" : value}
          </p>
          <p className="flex items-center gap-1.5 text-xs muted-text">
            <Icon className="size-3.5" aria-hidden="true" />
            {hint}
            {pulse && !loading && (
              <span className="relative ml-0.5 flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
            )}
          </p>
        </div>
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary",
            accent,
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  )
}