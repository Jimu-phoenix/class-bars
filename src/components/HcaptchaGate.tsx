import { useImperativeHandle, useRef, type Ref } from "react"
import HCaptcha from "@hcaptcha/react-hcaptcha"

export type HcaptchaGateHandle = {
  reset: () => void
}

type HcaptchaGateProps = {
  ref?: Ref<HcaptchaGateHandle>
  onVerify: (token: string) => void
  onExpire?: () => void
  onError?: () => void
}

const siteKey = import.meta.env.VITE_HCAPTCHA_SITEKEY

export default function HcaptchaGate({
  ref,
  onVerify,
  onExpire,
  onError,
}: HcaptchaGateProps) {
  const captchaRef = useRef<HCaptcha>(null)

  useImperativeHandle(
    ref,
    () => ({
      reset: () => captchaRef.current?.resetCaptcha(),
    }),
    []
  )

  if (!siteKey) return null

  return (
    <div className="flex justify-center">
      <HCaptcha
        ref={captchaRef}
        sitekey={siteKey}
        onVerify={(token) => onVerify(token)}
        onExpire={() => onExpire?.()}
        onError={() => onError?.()}
      />
    </div>
  )
}
