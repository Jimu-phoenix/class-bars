import { useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import {
  FlaskConical,
  Loader2,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Square,
  X,
} from "lucide-react"
import { leaveSandbox } from "@/lib/sandbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type SandboxDashboardShellProps = {
  title?: string
  description?: string
  isLive: boolean
  checkedInCount: number
  ending?: boolean
  resetting?: boolean
  onEnd: () => void
  onReset: () => void
  children: ReactNode
}

export default function SandboxDashboardShell({
  title,
  description,
  isLive,
  checkedInCount,
  ending = false,
  resetting = false,
  onEnd,
  onReset,
  children,
}: SandboxDashboardShellProps) {
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleExit = async () => {
    await leaveSandbox()
    navigate("/")
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="bg-amber-100 dark:bg-amber-950/40">
        <p className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-medium text-amber-800 dark:text-amber-200">
          <FlaskConical className="size-3.5" />
          Sandbox mode — test/demo environment. All data here is fake and disposable.
        </p>
      </div>

      <div className="flex">
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden"
            aria-hidden="true"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-background transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:z-10 lg:h-screen lg:translate-x-0",
            collapsed && "lg:w-16",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className={cn("flex items-center gap-2 p-3", collapsed && "lg:justify-center")}>
            <span className="font-heading text-base font-semibold">Class-BARS</span>
            {!collapsed && (
              <Badge
                variant="outline"
                className="border-amber-500/50 text-amber-700 dark:text-amber-300"
              >
                SANDBOX
              </Badge>
            )}
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
            >
              <X className="size-4" />
            </button>
          </div>

          <div
            className={cn(
              "mx-3 flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm",
              isLive
                ? "border-green-500/40 bg-green-500/10"
                : "border-border bg-muted/40",
              collapsed && "lg:justify-center lg:px-0",
            )}
          >
            <span className="relative flex size-2.5 shrink-0">
              <span
                className={cn(
                  "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                  isLive ? "bg-green-500" : "bg-muted-foreground",
                )}
              />
              <span
                className={cn(
                  "relative inline-flex size-2.5 rounded-full",
                  isLive ? "bg-green-600" : "bg-muted-foreground",
                )}
              />
            </span>
            {!collapsed && (
              <span className="truncate">
                {isLive ? `Live · ${checkedInCount} checked in` : "No live class"}
              </span>
            )}
          </div>

          <nav className="flex flex-col gap-1.5 p-3">
            {isLive && (
              <Button
                variant="destructive"
                size={collapsed ? "icon" : "default"}
                onClick={onEnd}
                disabled={ending}
                title="End class"
                className={!collapsed ? "justify-start" : undefined}
              >
                {ending ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Square data-icon="inline-start" />
                )}
                {!collapsed && "End class"}
              </Button>
            )}
            <Button
              variant="ghost"
              size={collapsed ? "icon" : "default"}
              onClick={onReset}
              disabled={resetting}
              title="Reset sandbox data"
              className={!collapsed ? "justify-start" : undefined}
            >
              {resetting ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <RotateCcw data-icon="inline-start" />
              )}
              {!collapsed && "Reset sandbox data"}
            </Button>
            <Button
              variant="ghost"
              size={collapsed ? "icon" : "default"}
              onClick={() => void handleExit()}
              title="Exit demo"
              className={!collapsed ? "justify-start" : undefined}
            >
              <LogOut data-icon="inline-start" />
              {!collapsed && "Exit demo"}
            </Button>
          </nav>

          <div className="mt-auto p-3">
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex"
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4 lg:hidden">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-1.5 text-foreground hover:bg-muted"
            >
              <Menu className="size-5" />
            </button>
            <span className="font-heading text-base font-semibold">Class-BARS</span>
            <span className="w-8" aria-hidden="true" />
          </header>

          <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 lg:px-8">
            {(title || description) && (
              <div>
                {title && <h1 className="font-heading text-2xl font-semibold">{title}</h1>}
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}