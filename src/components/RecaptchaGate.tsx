import {
  useEffect,
  useImperativeHandle,
  useRef,
  type Ref,
} from "react"

export type RecaptchaGateHandle = {
  reset: () => void
}

type RecaptchaGateProps = {
  ref?: Ref<RecaptchaGateHandle>
  onVerify: (token: string) => void
  onExpire?: () => void
  onError?: () => void
}

const SCRIPT_SRC = "https://www.google.com/recaptcha/api.js?render=explicit"
const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY

type RecaptchaWindow = Window & {
  grecaptcha?: {
    ready?: (cb: () => void) => void
    render: (el: HTMLElement, options: Record<string, unknown>) => number
    reset: (id?: number) => void
  }
}

let scriptPromise: Promise<void> | null = null

function loadRecaptchaScript(): Promise<void> {
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("reCAPTCHA requires a browser environment"))
      return
    }
    const g = (window as RecaptchaWindow).grecaptcha
    if (g?.render) {
      resolve()
      return
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    )
    const script = existing ?? document.createElement("script")
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => {
      const win = window as RecaptchaWindow
      if (win.grecaptcha?.ready) {
        win.grecaptcha.ready(() => resolve())
      } else {
        resolve()
      }
    }
    script.onerror = () => {
      scriptPromise = null
      reject(new Error("Failed to load the reCAPTCHA script"))
    }
    if (!existing) document.head.appendChild(script)
  })

  return scriptPromise
}

export default function RecaptchaGate({
  ref,
  onVerify,
  onExpire,
  onError,
}: RecaptchaGateProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<number | null>(null)
  const handlersRef = useRef({ onVerify, onExpire, onError })

  useEffect(() => {
    handlersRef.current = { onVerify, onExpire, onError }
  }, [onVerify, onExpire, onError])

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        const g = (window as RecaptchaWindow | undefined)?.grecaptcha
        if (widgetIdRef.current !== null && g?.reset) {
          try {
            g.reset(widgetIdRef.current)
          } catch {
            // widget already cleared — nothing to reset
          }
        }
      },
    }),
    []
  )

  useEffect(() => {
    if (!siteKey || !containerRef.current) return
    let disposed = false

    loadRecaptchaScript()
      .then(() => {
        if (disposed || !containerRef.current) return
        const g = (window as RecaptchaWindow).grecaptcha
        if (!g?.render) return
        widgetIdRef.current = g.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => handlersRef.current.onVerify(token),
          "expired-callback": () => handlersRef.current.onExpire?.(),
          "error-callback": () => handlersRef.current.onError?.(),
        })
      })
      .catch(() => {
        if (!disposed) handlersRef.current.onError?.()
      })

    return () => {
      disposed = true
    }
  }, [])

  if (!siteKey) return null

  return <div className="flex justify-center" ref={containerRef} />
}
