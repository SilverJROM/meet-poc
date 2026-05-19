# Validation — Batch 1 (Backend foundation)

**Verdict:** **PASS** (iteration 1).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.
**Verifier ≠ fixer:** confirmed. /projcore did not write any production code in this batch; only validation artifacts and a retroactive decision log entry.

---

## Gate 1 — Artifact completeness

All required artifacts present under `batch-1/`:

| Artifact | Present | Notes |
|---|:---:|---|
| `changes.md` | ✓ | Codex template followed (User Report + Root Cause + Code Changes per-file + Autonomous Decisions + Cross-module imports + Caveats) |
| `scenarios-implemented.md` | ✓ | One row per S1.1–S1.7 with PASS + test-file path + 1-line evidence |
| `test-report.md` | ✓ | `npm run build` + `cd backend && npm test` outputs, 5 files / 7 tests passed |
| `review.md` | ✓ | Self-review APPROVE rationale, 1 paragraph |
| `independent-validation.md` | ✓ | Fresh-eyes re-read; PASS verdict; evidence listed |
| `screenshots/` | ✓ (empty) | Correct: no UI in B1 |

## Gate 2 — Diff review

`git log --oneline` shows 4 atomic commits on `feat/meet-rebuild-b1-backend-foundation`:

```
5c63d68 docs: add batch 1 evidence artifacts
6aee58d feat: add backend auth foundation
b63e63e chore: move legacy poc aside
c0abd36 chore: snapshot legacy meet poc
```

Verified by reading each touched file:
- `backend/src/modules/auth/index.ts` — `/api/login` `/api/logout` `/api/me` semantics identical to legacy `server.js:117-151`; legacy log strings preserved verbatim (`[login] OK from <ip>: "<email>"`, `[login] FAIL from <ip>: …`).
- `backend/src/modules/auth/sessions.ts` — SQLite-backed sessions with `SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000`; `getSessionUser` deletes expired sessions on read (closes R1.5 second half).
- `backend/src/lib/passwords.ts` — scrypt hash format `<saltHex>:<hashHex>` byte-identical to legacy → migrated legacy hashes verify without rehashing (closes R10.2 cleanly).
- `backend/migrations/0001_init.sql` — schema matches brief; `users.email PRIMARY KEY COLLATE NOCASE` correctly handles case-insensitive emails (carries legacy behavior).
- `backend/src/db.ts` — `runMigrations()` is idempotent (tracks applied in `_migrations`); supports `:memory:` test mode and `MEET_DB_PATH` env override.
- `backend/src/server.ts` — `createApp(database)` factory pattern (testable); `/health` route; `/ws` WS upgrade placeholder (correct scope for B1, B2 replaces); `prepareDatabase` auto-migrates from `legacy-poc/data.json` on first boot.
- `backend/scripts/seed.ts` — idempotent; reads `INITIAL_PASSWORD.txt` 2-line format (`email\npassword`); does NOT log password.
- `backend/scripts/migrate-from-json.ts` — idempotent via `ON CONFLICT DO NOTHING`; transactional.
- `backend/tests/*.test.ts` — all use real `supertest` + real `better-sqlite3` temp DB + per-test cleanup; no mocks.
- `ecosystem.config.js` — adds `meet-poc-be` PM2 entry on port 4720; legacy `meet-poc` entry preserved on port 4700, updated `script: 'legacy-poc/server.js'` to match the file move.
- Legacy code moved into `legacy-poc/`: `server.js`, `public/`, `data.json`, `seed.js`, `package.json`. NOT moved (correctly): `recordings/`, `logs/`, `plan/`, `INITIAL_PASSWORD.txt`, `.gitignore`, `ecosystem.config.js`, `project_specs.md`.

Out-of-scope check: nothing in the diff touches rooms, signaling protocol (beyond echo placeholder), recording, frontend. Clean.

## Gate 3 — Build verification

```
$ npm run build
> meet-poc-rebuild@0.1.0 build
> npm run build -w backend
> @meet-poc/backend@0.1.0 build
> tsc -p tsconfig.json
```

PASS — zero TS errors, strict mode, NodeNext modules, ES2022 target.

## Gate 4 — Targeted test pass

```
$ cd backend && npm test
Test Files  5 passed (5)
     Tests  7 passed (7)
  Duration  1.57s
```

All S1.1–S1.7 green on independent re-run. Log captures show legacy-format `[login] OK from ::ffff:127.0.0.1: "jrom@silverjrom.app"` lines (R1.7 closure verified).

## Gate 5 — Evidence quality (5Q checklist)

| Q | Question | Verdict | Evidence |
|---|---|---|---|
| Q1 | Does each test actually exercise the scenario it claims? | ✓ | Read `auth-login.test.ts`: real POST `/api/login` via supertest, real DB row, real cookie roundtrip. Not a string-match-on-source smell. |
| Q2 | Proof at the right level? | ✓ | B1 has no UI; API-level proof IS the right level. (UI-level proof of the stitched-symptom closure deferred to B3 S3.5 per design.) |
| Q3 | Screenshots show claimed state? | ✓ (N/A) | No UI in B1 → empty `screenshots/` folder correctly. |
| Q4 | Scenario-to-test mapping consistent? | ✓ | Every S1.x in scenarios.md has a row in `scenarios-implemented.md` pointing to a real test file; every test in the test-report traces back to an S1.x. Counts match (7 tests = S1.1+S1.2+S1.3+S1.4+S1.5+S1.6+S1.7). |
| Q5 | Requirement closure? | ✓ | Independent smoke (below) confirms R1.1–R1.7 + R8.1 + R10.2 end-to-end: server boots, real login with INITIAL_PASSWORD.txt creds returns 200 + cookie, /api/me roundtrips, logout invalidates. |

### Independent smoke (live boot, not just test rerun)

Booted the backend on port 4720 with a fresh temp SQLite DB:

```
$ PORT=4720 MEET_DB_PATH=/tmp/meet-smoke-$$.sqlite npx tsx backend/src/server.ts
meet-poc backend listening on http://0.0.0.0:4720

$ curl /health           → {"ok":true}
$ curl /api/me           → {"user":null}
$ curl /api/login (real INITIAL_PASSWORD.txt line 2)
  → 200, Set-Cookie: session=…; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000
  → backend log: [login] OK from 127.0.0.1: "jrom@silverjrom.app"
  → body: {"email":"jrom@silverjrom.app"}
$ curl /api/me with cookie → {"user":{"email":"jrom@silverjrom.app"}}
$ curl /api/logout         → {"ok":true}
$ curl /api/me with cookie → {"user":null}
```

R1.5 30-day Max-Age verified in the Set-Cookie header (2592000 sec = 30 days).
R10.2 first-boot migration verified: fresh temp DB picked up `legacy-poc/data.json` automatically, allowing login with the legacy hash.

## Gate 6 — Requirement coverage matrix update

Updated `req-matrix.md`: R1.1–R1.7, R8.1 (partial: only `meet-poc-be` entry), R10.2 → **VERIFIED**.

| Req# | Status |
|------|--------|
| R1.1 | VERIFIED |
| R1.2 | VERIFIED |
| R1.3 | VERIFIED |
| R1.4 | VERIFIED |
| R1.5 | VERIFIED |
| R1.6 | VERIFIED |
| R1.7 | VERIFIED |
| R8.1 (B1 slice — `meet-poc-be` PM2 entry) | VERIFIED |
| R10.2 | VERIFIED |

R8.1 second half (`meet-poc-fe` PM2 entry) + R8.2 (consolidated port via `scripts/serve.js`) remain ASSIGNED to B3 per plan.

## Gate 7 — Standing rules + decisions log

**Standing rules check:** no new standing rules introduced. Codex's `changes.md Caveats` mentions 5 transitive-dependency moderate vulnerabilities reported by `npm install`; deferred per scope, flagged to revisit at B6 or post-cutover. Not a B1 blocker.

**Decisions log check (§1.10 added 2026-05-15):** codex documented 2 autonomous calls in `changes.md § Autonomous Decisions` but did NOT create per-run decision files under `projcore-run-2026-05-19/decisions/`. The brief asked for separate files; codex partially complied (recorded but in wrong location).

Decisions found in diff:
1. **INITIAL_PASSWORD.txt not committed/logged:** explicit brief instruction, not a choice. Not a "non-trivial autonomous call." No decision file needed.
2. **Adjusted `legacy-poc/server.js` recordings path to `../recordings`:** this IS a non-trivial choice (alternatives existed). **Retroactively logged** by /projcore at `projcore-run-2026-05-19/decisions/2026-05-19-b1-legacy-recordings-path.md`.

**Flag for B2 dispatch brief:** explicit reminder to write decisions per §1.15 directly under `projcore-run-2026-05-19/decisions/<date>-<slug>.md` (not only in changes.md).

This is a soft gate-7 pass (decision was logged in `changes.md`, just in wrong location). Not a FAIL — would have been a FAIL if no documentation existed at all.

## Other observations

- **Live `voice.silverjrom.app` is still served by the legacy `meet-poc` PM2 entry on port 4700.** Codex did not disrupt the live service. Correct per the B1 scope.
- **`pm2 restart meet-poc` (the legacy entry) would now pick up the new `legacy-poc/server.js` path per the updated ecosystem.config.js.** I did NOT restart it during validation to avoid disturbing the live service mid-run; the path change is verified by reading the ecosystem.config.js, not by a live restart. (If JROM wants me to restart it as part of B6 prep, that's the cutover batch's job.)
- **5 moderate npm-audit vulnerabilities** noted in codex's caveats — not blocking, revisit pre-cutover.

## Verdict

**STATUS: PASS** — B1 backend foundation complete, 9 requirements VERIFIED, legacy preserved, build clean, all tests green, live service undisturbed. Cleared for B2 dispatch.
