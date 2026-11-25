# Test Results — Class-BARS

**Date:** 2026-08-24
**Scope:** Non-destructive verification of the current codebase following the sandbox-module build.

---

## 1. How the tests were run

The project had **no test framework installed**. To keep the change footprint at absolute zero for
`package.json` / `package-lock.json` / `node_modules`, the suite uses:

- **Node's built-in test runner** (`node:test`) — no dependencies added
- **Node 24 native TypeScript type-stripping** — tests are plain `.ts`, run directly
- A tiny custom module loader (`tests/loader.mjs` + `tests/register.mjs`) that:
  - resolves the `@/*` → `src/*` path alias used by the app,
  - **replaces `@/lib/supabase` with an in-memory mock**, so sandbox auth logic is exercised
    without a single network request.

**Run command:**

```bash
node --import ./tests/register.mjs --test tests/*.test.ts
```

## 2. Non-destructiveness guarantees

| Risk | Mitigation |
|---|---|
| Writing to Supabase / real attendance tables | Supabase client fully mocked; **zero network I/O** |
| Running DB migrations | Migrations only *read as text* and statically asserted |
| Mutating app files | No file under `src/`, `migrations/`, or config was modified |
| Polluting git state | Only additions: `tests/` (new) + this report; verified via `git status` |

## 3. Results

```
tests  30   pass  30   fail  0   skipped 0
duration ≈ 1.0 s        lint (eslint tests) clean      npm run build passes
```

### Coverage by area

| File | What it verifies | Status |
|---|---|---|
| `tests/faceCompare.test.ts` (10) | `euclideanDistance` math (3-4-5 triangle, symmetry, zero-vector, length-mismatch throw), `isMatch` strict `<` boundary semantics, default threshold 0.6, custom-threshold override | ✅ all pass |
| `tests/sandbox.test.ts` (9) | `SANDBOX_DEFAULTS` match spec §6 labels exactly; `getSandboxRole` accepts only valid roles; `joinSandbox` reuses same-role sessions, signs out on role switch, forwards captcha token + role/full_name metadata; error mapping for hCaptcha failure, anonymous-auth-disabled, and generic errors; `leaveSandbox` signs out | ✅ all pass |
| `tests/schema.test.ts` (5) | Sandbox migration creates **only** `sandbox_sessions`/`sandbox_checkins`; RLS enabled on both; **no `ALTER TABLE` on any real table** (`profiles`, `courses`, `enrollments`, `attendance_records`, `face_embeddings`); no geofence/OTP concepts leaked into schema; security migration contains no sandbox policies; `table_state.json` parses as a valid snapshot | ✅ all pass |
| `tests/utils.test.ts` (5) | `cn()` class joining, falsy dropping, tailwind conflict resolution (`px-2 px-4 → px-4`), nested arrays/objects | ✅ all pass |

## 4. Observations

1. **Overall health is good.** All pure business logic tested behaves correctly, including the
   newest code (the sandbox module built by the parallel session). The full Vite production build
   succeeds (~6.6s).
2. **Spec compliance looks solid.** The sandbox migration follows the spec's Option B
   (fully separate tables), enables RLS, touches no real tables, and includes no geofencing or
   OTP remnants. Default labels match `CLASS-BARS_SANDBOX_MODULE_SPEC.md` §6 verbatim.
3. **Face-match semantics:** `isMatch` uses a strict `<` comparison against the 0.6 threshold —
   a descriptor pair at *exactly* threshold distance is rejected. Worth knowing when tuning
   false-accept/false-reject rates.
4. **Error UX is thoughtful:** `joinSandbox` translates raw Supabase errors into actionable hints
   (captcha setup, anonymous-auth enablement) rather than leaking provider jargon to demo users.
5. **No test infrastructure existed prior to this.** If the team wants this suite wired into
   scripts, add `"test": "node --import ./tests/register.mjs --test tests/*.test.ts"` to
   `package.json` — deliberately not done here to avoid touching files the other session modified.
6. **Pre-existing warning (not caused by tests):** the build emits a >500 kB chunk-size warning,
   likely from bundling `face-api.js`. Consider code-splitting or dynamic import for it later.
7. **Minor test-infra note:** Node's runner does not auto-discover `.ts` files from a directory
   argument here, hence explicit globs in the run command.
8. **Uncommitted work in tree:** `git status` shows the other session's changes still uncommitted
   (`src/lib/sandbox.ts`, `SandboxLanding.tsx`, `HcaptchaGate.tsx`, env/package updates). Tests
   were run against that working state and pass.

## 5. Files added by this run

```
tests/register.mjs          loader bootstrap (--import entry)
tests/loader.mjs            @/ alias resolution + supabase mock
tests/faceCompare.test.ts
tests/sandbox.test.ts
tests/utils.test.ts
tests/schema.test.ts
test_result.md              this report
```
