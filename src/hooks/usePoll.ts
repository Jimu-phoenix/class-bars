import { useEffect, useRef } from "react"

export function usePoll(callback: () => Promise<void>, delayMs: number | null) {
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  })

  useEffect(() => {
    if (delayMs === null) return
    let active = true
    let timer: ReturnType<typeof setTimeout>

    const tick = async () => {
      try {
        await callbackRef.current()
      } finally {
        if (active) {
          timer = setTimeout(tick, delayMs)
        }
      }
    }

    void tick()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [delayMs])
}
