import type { ReactNode } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import { LogOut } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type LecturerShellProps = {
  title?: string
  description?: string
  children: ReactNode
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-md px-2 py-1 text-sm transition-colors",
    isActive
      ? "bg-muted font-semibold text-foreground"
      : "text-muted-foreground hover:text-foreground",
  )

export default function LecturerShell({ title, description, children }: LecturerShellProps) {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    try {
      await signOut()
    } finally {
      navigate("/login")
    }
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2">
            <span className="font-heading text-base font-semibold">Class-BARS</span>
            <Badge variant="secondary">Lecturer</Badge>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/dashboard/courses" className={navLinkClass}>
              Courses
            </NavLink>
          </nav>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut data-icon="inline-start" />
            Sign out
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
