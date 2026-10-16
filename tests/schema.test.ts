import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

const root = new URL("../", import.meta.url)

async function read(rel: string) {
  return readFile(new URL(rel, root), "utf8")
}

test("sandbox migration creates only sandbox-scoped tables", async () => {
  const sql = await read("migrations/02_sandbox_module.sql")
  assert.match(sql, /create table (if not exists )?sandbox_sessions/)
  assert.match(sql, /create table (if not exists )?sandbox_checkins/)

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

test("sandbox participant migration is sandbox-scoped and RLS-enabled", async () => {
  const sql = await read("migrations/05_sandbox_participants.sql")
  assert.match(sql, /create table (if not exists )?sandbox_participants/)
  assert.match(sql, /alter table sandbox_participants enable row level security/i)

  const realTables = ["attendance_records", "face_embeddings", "profiles", "courses", "enrollments"]
  for (const table of realTables) {
    const alters = sql.match(new RegExp(`alter\\s+table\\s+(only\\s+)?public\\.${table}`, "gi")) ?? []
    assert.equal(alters.length, 0, `migration must not alter real table ${table}`)
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
  for (const row of rows) {
    assert.equal(typeof row.table_name, "string", "each row should have a table_name")
    assert.equal(typeof row.details, "string", "each row should carry a details JSON string")
    const details = JSON.parse(row.details as string) as {
      schema?: unknown
      columns?: Array<{ name?: unknown; type?: unknown }>
    }
    assert.equal(typeof details.schema, "string", `${row.table_name}: details.schema`)
    assert.ok(Array.isArray(details.columns), `${row.table_name}: details.columns`)
    for (const col of details.columns ?? []) {
      assert.equal(typeof col.name, "string", `${row.table_name}: column name`)
      assert.equal(typeof col.type, "string", `${row.table_name}: column type`)
    }
  }
})
