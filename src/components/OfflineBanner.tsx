import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 rounded-b-2xl border-b border-border bg-amber-500/5 p-2 text-center sm:p-3",
        "dark:border-amber-500/30 dark:bg-amber-900/20",
      )}
      role="status"
      aria-live="polite"
    >
      <span className="text-xs text-amber-800 dark:text-amber-400 font-medium">
        You&rsquo;re offline. Check-in needs an internet connection.
      </span>
    </div>
  )
}
