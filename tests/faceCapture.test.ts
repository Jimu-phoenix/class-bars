import assert from "node:assert/strict"
import { test } from "node:test"
import {
  summariseDistances,
  recordSessionDistance,
  getSessionDistances,
  clearSessionDistances,
} from "../src/lib/faceCapture.ts"

test("summariseDistances returns empty stats for empty input", () => {
  const result = summariseDistances([])
  assert.deepEqual(result, {
    attempts: 0,
    min: null,
    median: null,
    max: null,
  })
})

test("summariseDistances handles a single distance", () => {
  const result = summariseDistances([0.45])
  assert.deepEqual(result, {
    attempts: 1,
    min: 0.45,
    median: 0.45,
    max: 0.45,
  })
})

test("summariseDistances handles odd-length unsorted distances", () => {
  const result = summariseDistances([0.7, 0.2, 0.5])
  assert.deepEqual(result, {
    attempts: 3,
    min: 0.2,
    median: 0.5,
    max: 0.7,
  })
})

test("summariseDistances handles even-length unsorted distances", () => {
  const result = summariseDistances([0.6, 0.3, 0.4, 0.5])
  // sorted: [0.3, 0.4, 0.5, 0.6], median is (0.4 + 0.5) / 2 = 0.45
  assert.deepEqual(result, {
    attempts: 4,
    min: 0.3,
    median: 0.45,
    max: 0.6,
  })
})

test("session distances recording and clearing", () => {
  clearSessionDistances()
  assert.deepEqual(getSessionDistances(), [])
  recordSessionDistance(0.42)
  recordSessionDistance(0.58)
  assert.deepEqual(getSessionDistances(), [0.42, 0.58])
  const summary = summariseDistances(getSessionDistances())
  assert.equal(summary.attempts, 2)
  assert.equal(summary.min, 0.42)
  assert.equal(summary.max, 0.58)
  assert.equal(summary.median, 0.5)
  clearSessionDistances()
  assert.deepEqual(getSessionDistances(), [])
})
