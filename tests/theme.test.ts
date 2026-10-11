import assert from "node:assert/strict"
import { test } from "node:test"
import {
  THEMES,
  THEME_STORAGE_KEY,
  isTheme,
  nextTheme,
  readStoredTheme,
  resolveTheme,
} from "../src/lib/themeUtils.ts"

const savedWindow = globalThis.window

function withWindowAndStorage(getItem: (key: string) => string | null) {
  globalThis.window = {
    localStorage: { getItem },
  } as unknown as Window & typeof globalThis
  return () => {
    if (savedWindow === undefined) delete (globalThis as { window?: unknown }).window
    else globalThis.window = savedWindow
  }
}

test("nextTheme cycles light -> dark -> system -> light", () => {
  assert.equal(nextTheme("light"), "dark")
  assert.equal(nextTheme("dark"), "system")
  assert.equal(nextTheme("system"), "light")
})

test("resolveTheme honours an explicit choice over the system flag", () => {
  assert.equal(resolveTheme("light", true), "light")
  assert.equal(resolveTheme("dark", false), "dark")
})

test("resolveTheme consults the system flag only when theme is 'system'", () => {
  assert.equal(resolveTheme("system", true), "dark")
  assert.equal(resolveTheme("system", false), "light")
})

test("isTheme validates against the closed set", () => {
  for (const theme of THEMES) assert.equal(isTheme(theme), true)
  assert.equal(isTheme("solarized"), false)
  assert.equal(isTheme(null), false)
  assert.equal(isTheme(""), false)
})

test("readStoredTheme falls back to 'system' when storage is empty or absent", () => {
  const restore = withWindowAndStorage(() => null)
  assert.equal(readStoredTheme(), "system")
  restore()
})

test("readStoredTheme returns 'system' without a window", () => {
  if (savedWindow !== undefined) {
    delete (globalThis as { window?: unknown }).window
  }
  assert.equal(readStoredTheme(), "system")
  if (savedWindow !== undefined) globalThis.window = savedWindow
})

test("readStoredTheme tolerates a locked/unavailable storage", () => {
  const restore = withWindowAndStorage(() => {
    throw new Error("SecurityError: storage denied")
  })
  assert.equal(readStoredTheme(), "system")
  restore()
})

test("readStoredTheme loads a persisted valid theme", () => {
  const restore = withWindowAndStorage((key) =>
    key === THEME_STORAGE_KEY ? "dark" : null,
  )
  assert.equal(readStoredTheme(), "dark")
  restore()
})

test("readStoredTheme ignores a bogus persisted value", () => {
  const restore = withWindowAndStorage((key) =>
    key === THEME_STORAGE_KEY ? "solarized" : null,
  )
  assert.equal(readStoredTheme(), "system")
  restore()
})