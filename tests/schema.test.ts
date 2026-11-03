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
  for (const key of ["table_schema", "table_name", "column_name", "data_type"]) {
    assert.ok(key in rows[0], `snapshot rows should include ${key}`)
  }
})

test("face descriptor migration adds NOT VALID descriptor constraints", async () => {
  const sql = await read("migrations/32_face_descriptor_validation.sql")
  assert.match(sql, /is_valid_face_descriptor_text/i)
  assert.match(sql, /jsonb_typeof/i)
  assert.match(sql, /jsonb_array_length/i)
  assert.match(sql, /not valid/i)
  assert.match(sql, /immutable/i)
  assert.match(sql, /parallel safe/i)
  assert.match(sql, /set search_path = ''/i)
  for (const constraint of [
    "face_embeddings_embedding_json_valid",
    "sandbox_participants_embedding_valid",
    "sandbox_checkins_embedding_valid",
  ]) {
    assert.match(sql, new RegExp(constraint))
  }
})

test("consent migration adds consent columns to profiles", async () => {
  const sql = await read("migrations/34_consent_and_account_deletion.sql")
  assert.match(sql, /consent_given_at/i)
  assert.match(sql, /consent_version/i)
})

test("consent migration creates protect_profiles_consent trigger", async () => {
  const sql = await read("migrations/34_consent_and_account_deletion.sql")
  assert.match(sql, /protect_profiles_consent/i)
  assert.match(sql, /trg_protect_profiles_consent/i)
  assert.match(sql, /current_user in \('authenticated', 'anon'\)/i)
})

test("consent migration creates record_consent RPC", async () => {
  const sql = await read("migrations/34_consent_and_account_deletion.sql")
  assert.match(sql, /record_consent/i)
  assert.match(sql, /2026-11-v1/i) // version format example in comment is fine; check regex
  assert.match(sql, /^[0-9]{4}-[0-9]{2}-v[0-9]+$/i)
})

test("consent migration creates delete_my_account RPC", async () => {
  const sql = await read("migrations/34_consent_and_account_deletion.sql")
  assert.match(sql, /delete_my_account/i)
  assert.match(sql, /auth\.users/i)
  assert.match(sql, /student_id = null/i)
})

test("consent migration makes attendance_records.student_id nullable", async () => {
  const sql = await read("migrations/34_consent_and_account_deletion.sql")
  assert.match(sql, /alter column student_id drop not null/i)
})

test("consent migration adds consent_required to upsert_face_embedding", async () => {
  const sql = await read("migrations/34_consent_and_account_deletion.sql")
  assert.match(sql, /consent_required/i)
})

test("consent migration adds consent_required to _check_in_attendance for face", async () => {
  const sql = await read("migrations/34_consent_and_account_deletion.sql")
  assert.match(sql, /p_method = 'face'.*consent_given_at|consent_given_at.*p_method = 'face'/is)
})

test("manual mark migration adds get_session_enrolled_students RPC", async () => {
  const sql = await read("migrations/35_lecturer_manual_mark.sql")
  assert.match(sql, /get_session_enrolled_students/i)
  assert.match(sql, /registration_number/i)
  assert.match(sql, /checked_in/i)
})

test("manual mark migration adds lecturer_mark_present RPC", async () => {
  const sql = await read("migrations/35_lecturer_manual_mark.sql")
  assert.match(sql, /lecturer_mark_present/i)
  assert.match(sql, /is_lecturer_user/i)
  assert.match(sql, /'already recorded'/i)
  assert.match(sql, /attendance.manual_marked/i)
})

test("manual mark migration rejects manual in _check_in_attendance", async () => {
  const sql = await read("migrations/35_lecturer_manual_mark.sql")
  assert.match(sql, /manual_not_allowed/i)
})

test("manual mark migration rejects manual in 8-arg check_in_attendance", async () => {
  const sql = await read("migrations/35_lecturer_manual_mark.sql")
  assert.match(sql, /p_method = 'manual' then\n    raise exception 'manual_not_allowed'/s)
})
