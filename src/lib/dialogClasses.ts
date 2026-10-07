/**
 * Class names for a shadcn <DialogContent> that fills the whole screen on
 * phones (respecting notches / home indicator) and behaves like a normal
 * centered dialog from the `sm` breakpoint up.
 *
 * Usage: <DialogContent className={fullScreenOnMobile}>
 */
export const fullScreenOnMobile = [
  "max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:w-screen max-sm:max-w-none",
  "max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0",
  "max-sm:overflow-y-auto max-sm:content-start",
  "max-sm:pt-[max(1rem,env(safe-area-inset-top))]",
  "max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]",
  "sm:max-h-[90dvh] sm:overflow-y-auto",
].join(" ")
