import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { FlaskConical, LogOut } from "lucide-react"
import { leaveSandbox } from "@/lib/sandbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type SandboxShellProps = {
  title?: string
  description?: string
  children: ReactNode
}

export default function SandboxShell({ title, description, children }: SandboxShellProps) {
  const navigate = useNavigate()

  const handleExit = async () => {
    await leaveSandbox()
    navigate("/")
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="bg-amber-100 dark:bg-amber-950/40">
        <p className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200">
          <FlaskConical className="size-3.5" />
          Sandbox mode — test/demo environment. All data here is fake and disposable.
        </p>
      </div>
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 items-center justify-between gap-4 px-4 sm:max-w-6xl">
          <div className="flex items-center gap-2">
            <span className="font-heading text-base font-semibold">Class-BARS</span>
            <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">
              SANDBOX
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={handleExit}>
            <LogOut data-icon="inline-start" />
            Exit demo
          </Button>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        {(title || description) && (
          <div>
            {title && <h1 className="font-heading text-2xl font-semibold">{title}</h1>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
