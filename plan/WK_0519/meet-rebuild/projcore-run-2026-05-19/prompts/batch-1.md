# Batch B1 — Backend foundation

**Persona switch:** Invoke `$lead`. You are NOT `$projcore` for this dispatch. Claude `/projcore` is supervising from this session (no tmux peer-pane). Read the contract files below before touching code.

**Batch ID:** B1
**Plan:** `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-rebuild/implementation-plan.md`
**Branch:** `feat/meet-rebuild-b1-backend-foundation`
**Repo:** `/home/agjrom/websites/meet-poc` — **currently NOT a git repo. Part of this batch is `git init` + initial legacy snapshot commit before introducing new structure.**

**Requirements assigned (verbatim ranges from og-requirements.md):**
- **R1.1-R1.7** (Auth: login/me/logout, password hashing, session TTL, seeded user, login logging)
- **R8.1-R8.2** (PM2 `meet-poc-be` entry + consolidated port scaffold; `meet-poc-fe` deferred to B3)
- **R10.2** (data.json → SQLite migration)

Read in full before coding:
- `og-requirements.md` (the contract) — `plan/WK_0519/meet-rebuild/og-requirements.md`
- `scenarios.md` (the testing contract — your S1.x rows) — `plan/WK_0519/meet-rebuild/scenarios.md`
- `project_specs.md` (architectural truth) — `project_specs.md` at repo root
- `context-handoff.md` (what's in the repo today, what B1 must produce) — `plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/context-handoff.md`

---

## Context (compressed from context-handoff.md)

The current repo is a single-file Express + ws PoC at port 4700 (PM2 entry `meet-poc`) with vanilla-JS frontend in `public/` and JSON-file storage (`data.json`). It's running today, serving https://voice.silverjrom.app. **Do not break this during B1.** New backend must run on a sibling port (4720 suggested) so the legacy continues to serve while we build. CF Tunnel swap happens in B6.

`data.json` contains one seeded user `jrom@silverjrom.app` with a scrypt hash (format `<saltHex>:<scryptHashHex>`). `INITIAL_PASSWORD.txt` holds the bootstrap seed — read it for the migration, never log its contents.

---

## Observed (current state)

- `server.js` (lines 36-50): scrypt password hashing implementation
- `server.js` (lines 52-78): session create/destroy with `SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000`
- `server.js` (lines 117-151): `/api/login`, `/api/logout`, `/api/me` routes
- `seed.js`: reads `INITIAL_PASSWORD.txt` and seeds `data.json`
- `ecosystem.config.js`: PM2 entry `meet-poc` on PORT=4700

---

## Expected (acceptance criteria)

1. **Repo is a git repo.** `git init` + `git config user.email "claude@agentic.local"` + `git config user.name "claude-meet-rebuild"` if not set globally. First commit on `master` or `main`: snapshot of current state (everything except `node_modules/`). Second commit: legacy code moved to `legacy-poc/` (see step 2). Subsequent commits: backend scaffold + tests + ecosystem update. Atomic commits — group by purpose.
2. **Legacy code moved to `legacy-poc/`**: move `server.js`, `public/`, `data.json`, `seed.js`, `package.json` (the legacy one) into `legacy-poc/`. **Do NOT move:** `recordings/`, `logs/`, `plan/`, `INITIAL_PASSWORD.txt`, `.gitignore`, `ecosystem.config.js`, `project_specs.md`. Update `.gitignore` to also include `data/` (new SQLite location) + `backend/dist/` + `backend/node_modules/`.
3. **Root `package.json`** with workspaces array: `["backend"]` for now (frontend + e2e added in later batches). Top-level scripts that delegate to backend at minimum.
4. **`backend/` workspace** with:
   - `backend/package.json` — deps: `express`, `ws`, `better-sqlite3`, `cookie`. Dev deps: `typescript`, `tsx`, `@types/node`, `@types/express`, `@types/ws`, `@types/better-sqlite3`, `vitest`, `supertest`, `@types/supertest`.
   - `backend/tsconfig.json` — strict TS, target ES2022, module NodeNext, outDir `dist`.
   - `backend/src/server.ts` — entry that wires HTTP (Express) + WebSocket (placeholder `/ws` echo for now; full protocol lives in B2). Listens on `PORT` env (default 4720). Calls `runMigrations()` + optional auto-`migrateFromJson()` if SQLite is empty AND `legacy-poc/data.json` exists.
   - `backend/src/db.ts` — initializes `better-sqlite3` at `data/meet-poc.sqlite` (creates `data/` dir); exposes `getDb()`. Migration runner reads files matching `migrations/*.sql` in order, tracking applied state in a `_migrations` table.
   - `backend/src/lib/cookies.ts` — `parseCookies(header)`, `serializeSessionCookie(req, value, maxAgeSec)` — keep behavior identical to legacy `server.js`.
   - `backend/src/lib/passwords.ts` — `hashPassword(plaintext)` + `verifyPassword(plaintext, stored)`. **Use scrypt with the legacy format `<saltHex>:<scryptHashHex>`** so migrated users authenticate without re-hashing.
   - `backend/src/modules/auth/index.ts` — Express router exposing `POST /api/login`, `POST /api/logout`, `GET /api/me`. Behavior identical to legacy `server.js:117-151` (including the log lines for login OK/FAIL — preserve message format so existing log grep continues to work).
   - `backend/src/modules/auth/sessions.ts` — `createSession(email)`, `getSessionUser(token)`, `destroySession(token)`, with 30-day TTL. Sessions in SQLite (not JSON). `getSessionUser` deletes expired sessions on read (R1.5 second half).
   - `backend/migrations/0001_init.sql` — `CREATE TABLE IF NOT EXISTS users (...)`, `sessions (...)`. Schema:
     ```sql
     CREATE TABLE IF NOT EXISTS users (
       email TEXT PRIMARY KEY COLLATE NOCASE,
       password_hash TEXT NOT NULL,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     );
     CREATE TABLE IF NOT EXISTS sessions (
       token TEXT PRIMARY KEY,
       email TEXT NOT NULL,
       expires_at INTEGER NOT NULL,
       FOREIGN KEY (email) REFERENCES users(email)
     );
     CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);
     CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
     ```
   - `backend/scripts/seed.ts` — reads `INITIAL_PASSWORD.txt`, upserts `jrom@silverjrom.app`. Idempotent. **Do not log the password.**
   - `backend/scripts/migrate-from-json.ts` — reads `legacy-poc/data.json` (or whatever path) and inserts its users + sessions into SQLite if missing. Idempotent. Called from `src/server.ts` on first boot if SQLite has 0 users AND legacy json exists.
5. **`backend/tests/` with vitest specs** covering all S1.x scenarios. Use real DB on a per-test temp file (e.g. `:memory:` or `data/test-<uid>.sqlite` cleaned up after). Use `supertest` against an Express instance — NOT mocked.
6. **`ecosystem.config.js`** — add a new entry `meet-poc-be` (script: `npx tsx watch backend/src/server.ts` for dev, env `PORT: 4720`). Leave the legacy `meet-poc` entry **unchanged** (still serves 4700 + voice.silverjrom.app). B6 will retire it.
7. **All scenarios S1.1-S1.7 must be green** when running `cd backend && npm test`.

## Likely files (summary)

```
backend/
├── package.json
├── tsconfig.json
├── vitest.config.ts (or vitest config in package.json)
├── src/
│   ├── server.ts
│   ├── db.ts
│   ├── lib/cookies.ts
│   ├── lib/passwords.ts
│   └── modules/auth/
│       ├── index.ts
│       └── sessions.ts
├── migrations/
│   └── 0001_init.sql
├── scripts/
│   ├── seed.ts
│   └── migrate-from-json.ts
└── tests/
    ├── auth-login.test.ts
    ├── auth-me-logout.test.ts
    ├── passwords.test.ts
    ├── sessions-ttl.test.ts
    └── migrate-from-json.test.ts
legacy-poc/                    ← moved from repo root
├── server.js
├── public/
├── data.json
├── seed.js
└── package.json
package.json                   ← new root, workspaces
ecosystem.config.js            ← updated (adds meet-poc-be)
.gitignore                     ← updated (data/, backend/dist/, backend/node_modules/)
```

## Scope (hard limits — surgical only)

- **DO** the items in Expected.
- **DO NOT** start the frontend (`frontend/` is B3).
- **DO NOT** implement room CRUD (`/api/rooms`) or WebSocket protocol — those are B2.
- **DO NOT** touch `recordings/` or implement the `/upload` route — B5.
- **DO NOT** touch CF Tunnel or PM2 for the legacy `meet-poc` entry — B6.
- **DO NOT** modify `INITIAL_PASSWORD.txt`. Read it once for migration; do not echo its contents anywhere.
- **DO NOT** delete the legacy code from disk during B1 — only move into `legacy-poc/`. Deletion happens in B6 after cutover smoke.
- No "while I'm in here" scope creep. If you find a bug that's not in your assigned reqs, mention it in `changes.md Caveats`, do not fix it.

## Required artifacts (under `plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-1/`)

Create folder `plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-1/` and produce:

1. **`changes.md`** — Codex template:
   - **User Report verbatim** (block-quote /projcore's brief or JROM's stitched-up quote)
   - **Root Cause (mechanism-level)** — there isn't a "bug" per se; explain what the legacy app was and why the rebuild's auth foundation closes which reqs at the mechanism level
   - **Code Changes (per-file WHY)** — list every file touched with a 1-2 line WHY
   - **Autonomous decisions** — explicitly state any choices you made between offered options OR write "Autonomous decisions: none — all choices matched projcore brief defaults"
   - **Modules touched + cross-module imports** (lokalcamp's gate-8 style — though we're a simpler tree, still apply the discipline)
   - **Caveats / things-to-revisit** — short bullet list
2. **`scenarios-implemented.md`** — one row per S1.x scenario with PASS/FAIL + test-file path + 1-line evidence
3. **`test-report.md`** — `npm test` output (tail), test counts, any flaky tests
4. **`review.md`** — your self-review: 1 paragraph "I would APPROVE this PR because…" or "I would REJECT this PR because…"
5. **`independent-validation.md`** — fresh-eyes re-read of your own diff with sub-personas; for B1 acceptable to skip this section if you note why (e.g. "single-batch foundation; /projcore does the independent validation")
6. **`screenshots/`** — empty for B1 (no UI yet); create the folder anyway so the structure is consistent
7. **`decisions/`** — under `projcore-run-2026-05-19/decisions/` write a single `2026-05-19-b1-<slug>.md` for any autonomous calls. Even "none" must be explicit per §1.10 gate 7.

## Completion protocol

End your final reply with:

```
STATUS: DONE — B1 backend foundation complete, all S1.x green, legacy preserved
```

OR

```
STATUS: BLOCKED — <specific blocker>
```

OR

```
STATUS: NEEDS-INFO — <specific question for projcore>
```

**Also append to `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/progress.md` and `callbacks.md` (create if missing):**

```
[projcore callback] batch-1 DONE — backend scaffold + auth module + tests green
```

(or BLOCKED / NEEDS-INFO as appropriate)

## Confirmation-prompt protocol (mandatory)

If you hit any tool-confirmation prompt (rm, destructive, network, sudo, etc.) — BEFORE waiting on the confirmation, FIRST append to `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/callbacks.md`:

```
[projcore NEEDS-CONFIRM] <one-line command summary> — awaiting projcore approval
```

THEN wait on the confirmation. /projcore monitors callbacks and will respond.

## Model + reasoning guidance

- This is foundation work — straightforward TS scaffolding, no algorithmic complexity. Cost-aware tier is fine; escalate only if SQLite schema or session-cookie security needs deeper reasoning.
- Use real DB in tests; do not mock SQLite. Use real password hash round-trips; do not mock crypto.
- Preserve the legacy `[login] OK from <ip>: "<email>"` and `[login] FAIL from <ip>: …` log format verbatim — closing R1.7 means matching those strings.
- Idempotent migrations: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN` only.

— /projcore (Claude, Opus, 2026-05-19)
