import { useImperativeHandle, useRef, type Ref } from "react"
import ReCaptcha from "react-google-recaptcha"
import { RECAPTCHA_SITE_KEY } from "@/lib/captcha"

export type CaptchaGateHandle = {
  reset: () => void
}

type CaptchaGateProps = {
  ref?: Ref<CaptchaGateHandle>
  onVerify: (token: string) => void
  onExpire?: () => void
  onError?: () => void
}

export default function CaptchaGate({
  ref,
  onVerify,
  onExpire,
  onError,
}: CaptchaGateProps) {
  const captchaRef = useRef<ReCaptcha>(null)

  useImperativeHandle(
    ref,
    () => ({
      reset: () => captchaRef.current?.reset(),
    }),
    []
  )

  if (!RECAPTCHA_SITE_KEY) return null

  return (
    <div className="flex justify-center">
      <ReCaptcha
        ref={captchaRef}
        sitekey={RECAPTCHA_SITE_KEY}
        onChange={(token) => {
          if (token) onVerify(token)
        }}
        onExpired={() => onExpire?.()}
        onErrored={() => onError?.()}
      />
    </div>
  )
}
