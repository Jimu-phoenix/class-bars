import { Link } from "react-router-dom"
import { ArrowUpRight, FileQuestion } from "lucide-react"

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-foreground">
        <FileQuestion className="size-7" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <p className="font-heading mt-8 text-7xl font-medium tracking-tighter text-foreground/10 sm:text-8xl">
        404
      </p>
      <h1 className="font-heading mt-2 text-2xl font-medium tracking-tight">Page not found</h1>
      <p className="mt-3 max-w-sm text-sm text-pretty text-muted-foreground">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-foreground/85"
      >
        Back to home
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  )
}