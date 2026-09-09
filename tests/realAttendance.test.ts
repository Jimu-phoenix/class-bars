import assert from "node:assert/strict"
import { test } from "node:test"
import { faceConfidence, parseEmbedding } from "../src/lib/faceCompare.ts"

test("parseEmbedding parses a valid 128-length JSON array", () => {
  const arr = Array.from({ length: 128 }, (_, i) => i / 100)
  const parsed = parseEmbedding(JSON.stringify(arr))
  assert.ok(parsed instanceof Float32Array)
  assert.equal(parsed.length, 128)
  assert.ok(Math.abs(parsed[127] - 1.27) < 1e-4)
})

test("parseEmbedding returns null for a wrong-length array", () => {
  assert.equal(parseEmbedding(JSON.stringify([1, 2, 3])), null)
})

test("parseEmbedding returns null for malformed JSON", () => {
  assert.equal(parseEmbedding("{not json"), null)
})

test("parseEmbedding returns null for non-array JSON", () => {
  assert.equal(parseEmbedding('{"a": 1}'), null)
})

test("faceConfidence is 1 - distance for in-range distances", () => {
  assert.equal(faceConfidence(0.3), 0.7)
})

test("faceConfidence clamps at zero for far distances", () => {
  assert.equal(faceConfidence(1.5), 0)
})

test("faceConfidence clamps at one for identical descriptors", () => {
  assert.equal(faceConfidence(-0.2), 1)
})