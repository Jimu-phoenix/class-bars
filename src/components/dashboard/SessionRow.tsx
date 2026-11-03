import { Link, useNavigate } from "react-router-dom"
import {
  Ban,
  CalendarDays,
  Clock,
  MapPin,
  Play,
  Square,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { SessionStatus } from "@/types/db"

const statusVariant: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  scheduled: "outline",
  ongoing: "default",
  completed: "outline",
  cancelled: "destructive",
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatRange(startIso: string, endIso: string) {
  const end = new Date(endIso)
  return `${formatDateTime(startIso)} – ${end.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

export type SessionRowProps = {
  id: string
  courseCode: string
  courseName: string
  venueName: string | null
  scheduledStart: string
  scheduledEnd?: string | null
  status: SessionStatus
  onSelect?: (id: string) => void
  actions?: boolean
  busyId?: string | null
  onAction?: (id: string, action: "start" | "end" | "cancel") => void
}

export default function SessionRow({
  id,
  courseCode,
  courseName,
  venueName,
  scheduledStart,
  scheduledEnd = null,
  status,
  onSelect,
  actions = false,
  busyId,
  onAction,
}: SessionRowProps) {
  const navigate = useNavigate()

  const handleSelect = () => {
    if (onSelect) {
      onSelect(id)
    } else {
      navigate(`/dashboard/sessions/${id}`)
    }
  }

  const runAction = (action: "start" | "end" | "cancel") => {
    if (onAction) {
      onAction(id, action)
    }
  }

  return (
    <li className="flex items-center justify-between gap-4 py-4">
      <div
        className="min-w-0 cursor-pointer"
        onClick={handleSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handleSelect()
          }
        }}
        role="link"
        tabIndex={0}
        aria-label={`View session ${courseCode}`}
      >
        <Link
          to={`/dashboard/sessions/${id}`}
          className="truncate font-medium transition-colors hover:text-primary hover:underline"
        >
          {courseCode} — {courseName}
        </Link>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs muted-text">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {scheduledEnd
              ? formatRange(scheduledStart, scheduledEnd)
              : formatDateTime(scheduledStart)}
          </span>
          {venueName && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {venueName}
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions && status === "scheduled" && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={busyId === id}
              onClick={() => void runAction("start")}
            >
              {busyId === id ? (
                <Clock className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Play data-icon="inline-start" aria-hidden="true" />
              )}
              Start
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Cancel session"
              disabled={busyId === id}
              onClick={() => void runAction("cancel")}
            >
              <Ban aria-hidden="true" />
            </Button>
          </>
        )}
        {actions && status === "ongoing" && (
          <Button
            size="sm"
            variant="destructive"
            disabled={busyId === id}
            onClick={() => void runAction("end")}
          >
            {busyId === id ? (
              <Square className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Square data-icon="inline-start" aria-hidden="true" />
            )}
            End
          </Button>
        )}
        <Badge variant={statusVariant[status] ?? "outline"} className="gap-1.5">
          {status === "ongoing" && (
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-black/30 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-black" />
            </span>
          )}
          {status}
        </Badge>
      </div>
    </li>
  )
}
