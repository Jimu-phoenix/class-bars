import assert from "node:assert/strict"
import { test } from "node:test"
import { cn } from "../src/lib/utils.ts"

test("cn joins plain class names", () => {
  assert.equal(cn("a", "b"), "a b")
})

test("cn drops falsy inputs", () => {
  const isHidden = false
  assert.equal(cn("a", isHidden && "hidden", undefined, null, "c"), "a c")
})

test("cn resolves conflicting tailwind utilities to the last one", () => {
  assert.equal(cn("px-2", "px-4"), "px-4")
  assert.equal(cn("text-sm", "text-lg"), "text-lg")
})

test("cn keeps non-conflicting tailwind classes", () => {
  assert.equal(cn("px-2", "py-4"), "px-2 py-4")
})

test("cn flattens nested arrays and objects", () => {
  assert.equal(cn(["px-2", { hidden: false, block: true }]), "px-2 block")
})
