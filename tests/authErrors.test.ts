import assert from "node:assert/strict"
import { test } from "node:test"

const {
  mapAuthError,
  isNativeCaptchaError,
  NATIVE_CAPTCHA_HINT,
  CAPTCHA_HINT,
  ANON_DISABLED_HINT,
} = await import("../src/lib/authErrors.ts")

test("isNativeCaptchaError detects GoTrue native captcha rejections", () => {
  assert.equal(
    isNativeCaptchaError(
      "captcha protection: request disallowed (no captcha_token found)",
    ),
    true,
  )
  assert.equal(isNativeCaptchaError("Captcha verification failed"), false)
  assert.equal(isNativeCaptchaError("Network unreachable"), false)
})

test("mapAuthError points the native captcha error at the disable switch", () => {
  assert.equal(
    mapAuthError("captcha protection: request disallowed (no captcha_token found)"),
    NATIVE_CAPTCHA_HINT,
  )
})

test("mapAuthError maps hook captcha failures to the reCAPTCHA hint", () => {
  assert.equal(mapAuthError("Captcha verification failed"), CAPTCHA_HINT)
})

test("mapAuthError maps anonymous-disabled errors to setup instructions", () => {
  assert.equal(mapAuthError("Anonymous sign-ins are disabled"), ANON_DISABLED_HINT)
})

test("mapAuthError passes unrelated errors through unchanged", () => {
  assert.equal(mapAuthError("Network unreachable"), "Network unreachable")
})
