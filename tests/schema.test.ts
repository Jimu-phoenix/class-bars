import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

const root = new URL("../", import.meta.url)

async function read(rel: string) {
  return readFile(new URL(rel, root), "utf8")
}

test("sandbox migration creates only sandbox-scoped tables", async () => {
  const sql = await read("migrations/02_sandbox_module.sql")
  assert.match(sql, /create table sandbox_sessions/)
  assert.match(sql, /create table sandbox_checkins/)

  const realTables = ["attendance_records", "face_embeddings", "profiles", "courses", "enrollments"]
  for (const table of realTables) {
    const alters = sql.match(new RegExp(`alter\\s+table\\s+(only\\s+)?public\\.${table}`, "gi")) ?? []
    assert.equal(
      alters.length,
      0,
      `migration must not alter real table ${table}`,
    )
  }
})

test("sandbox tables have row level security enabled", async () => {
  const sql = await read("migrations/02_sandbox_module.sql")
  for (const table of ["sandbox_sessions", "sandbox_checkins"]) {
    assert.match(sql, new RegExp(`alter table ${table} enable row level security`, "i"))
  }
})

test("no geofencing or OTP concepts appear in the sandbox migration", async () => {
  const sql = await read("migrations/02_sandbox_module.sql")
  assert.doesNotMatch(sql, /geofenc|latitude|longitude|\botp\b|one.?time.?password/i)
})

test("security migration leaves sandbox tables out of real-table policies", async () => {
  const sql = await read("migrations/01_security_and_policies.sql")
  assert.ok(sql.trim().length > 0)
  assert.doesNotMatch(sql, /sandbox_/i)
})

test("table_state.json is a parseable schema snapshot", async () => {
  const raw = await read("table_state.json")
  const rows = JSON.parse(raw) as Array<Record<string, unknown>>
  assert.ok(Array.isArray(rows))
  assert.ok(rows.length > 0)
  for (const key of ["table_schema", "table_name", "column_name", "data_type"]) {
    assert.ok(key in rows[0], `snapshot rows should include ${key}`)
  }
})
