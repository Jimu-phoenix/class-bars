import { useRef, useState } from "react"
import { type CaptchaGateHandle } from "@/components/CaptchaGate"
import { CAPTCHA_REQUIRED } from "@/lib/captcha"
/**
 * Hook wiring the reCAPTCHA v2 gate into a sign-in / sign-up form.
 *
 * Returns the CaptchaGate ref callback props plus a `captchaReady` boolean
 * derived from `CAPTCHA_REQUIRED && token`. When no site key is configured
 * the gate renders as a no-op and `captchaReady` is true, so the submit
 * button is never incorrectly disabled.
 *
 * Note: the token is captured client-side only; server-side verification is
 * intentionally not enforced in this build (see captcha.ts). This hook is
 * UX wiring, not a security boundary.
 */
export function useCaptcha() {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const captchaRef = useRef<CaptchaGateHandle>(null)

  const reset = () => {
    setCaptchaToken(null)
    captchaRef.current?.reset()
  }

  const captchaReady = !CAPTCHA_REQUIRED || !!captchaToken

  return {
    captchaRef,
    captchaToken,
    onVerify: setCaptchaToken,
    onExpire: reset,
    onError: reset,
    captchaReady,
  }
}
