import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const DISMISS_KEY = "class-bars:pwa-install-dismissed"

function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.platform) ||
    (navigator.userAgent.includes("Mac") && "ontouchend" in document)
  )
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null)
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1"
    } catch {
      return false
    }
  })
  const handleBeforeInstallPrompt = useCallback((e: Event) => {
    e.preventDefault()
    setDeferredPrompt(e)
  }, [])

  useEffect(() => {
    if (isStandalone() || isIOS() || dismissed) return
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    }
  }, [dismissed, handleBeforeInstallPrompt])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    try {
      ;(deferredPrompt as unknown as { prompt: () => void; userChoice: Promise<unknown> }).prompt()
      await (deferredPrompt as unknown as { userChoice: Promise<unknown> }).userChoice
    } catch {
      // install was cancelled or failed — silently ignore
    } finally {
      setDeferredPrompt(null)
      setDismissed(true)
      try {
        localStorage.setItem(DISMISS_KEY, "1")
      } catch {
        // storage unavailable — ignore
      }
    }
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    setDeferredPrompt(null)
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // storage unavailable — ignore
    }
  }, [])

  // iOS: already installed (standalone) → hide
  if (isStandalone()) return null

  // iOS Safari: show hint instead of install button
  if (isIOS()) {
    return (
      <p
        className={cn(
          "fixed bottom-4 left-4 right-4 z-50 flex items-center justify-center gap-2 rounded-2xl border border-border bg-background p-3 text-center sm:text-left shadow-xl sm:max-w-md sm:mx-auto",
          "dark:border-white/10 dark:bg-[#0f0f10]",
        )}
      >
        <span className="text-xs text-muted-foreground dark:text-gray-300">
          Tap Share, then Add to Home Screen
        </span>
      </p>
    )
  }

  // Android/Chrome: show install button
  if (!deferredPrompt || dismissed) return null

  return (
    <div
      className={cn(
        "fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between gap-2 rounded-2xl border border-border bg-background p-3 shadow-xl sm:flex-row",
        "dark:border-white/10 dark:bg-[#0f0f10]",
      )}
      role="status"
      aria-live="polite"
    >
      <p className="text-sm text-muted-foreground dark:text-gray-300">
        Install Class-BARS
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDismiss}
          className="rounded-full text-sm text-muted-foreground hover:bg-muted"
        >
          Later
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleInstall}
          className="rounded-full text-sm"
        >
          Install app
        </Button>
      </div>
    </div>
  )
}
