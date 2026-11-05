import { useCallback, useState } from "react"
import { registerSW } from "virtual:pwa-register"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)

  const updateServiceWorker = registerSW({
    onNeedRefresh: () => setNeedRefresh(true),
  })

  const handleUpdate = useCallback(async () => {
    await updateServiceWorker(true)
  }, [updateServiceWorker])

  const handleLater = useCallback(() => {
    setNeedRefresh(false)
  }, [])

  if (!needRefresh) return null

  return (
    <div
      className={cn(
        "fixed bottom-4 left-4 right-4 z-50 flex flex-col items-center justify-between gap-2 rounded-2xl border border-border bg-background p-4 shadow-xl sm:flex-row",
        "dark:border-white/10 dark:bg-[#0f0f10]",
      )}
      role="status"
      aria-live="polite"
    >
      <p className="text-sm text-muted-foreground dark:text-gray-300">
        A new version is available
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleLater}
          className="rounded-full text-sm text-muted-foreground hover:bg-muted"
        >
          Later
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleUpdate}
          className="rounded-full text-sm"
        >
          Update
        </Button>
      </div>
    </div>
  )
}
