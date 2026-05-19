# Batch B2 — Rooms API + signaling (raw WebSocket)

**Persona switch:** Invoke `$lead`. You are NOT `$projcore` for this dispatch. Claude `/projcore` supervises. Read the contract files below before touching code.

**Batch ID:** B2
**Plan:** `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-rebuild/implementation-plan.md`
**Branch:** `feat/meet-rebuild-b2-rooms-signaling` — create off the current B1 HEAD on `feat/meet-rebuild-b1-backend-foundation` (B1 is PASSED; no merge to main yet — batches stack on the most recent passed branch until cutover).

**Requirements assigned (verbatim from og-requirements.md):**
- **R2.1-R2.5** (Rooms CRUD: create / list-own / delete-own / public-exists / 12-hex id)
- **R3.1-R3.8** (Signaling: join, owner auto-admit, knock, admit/reject, signal relay, peer-left, wire-format identity, 8-peer soft cap)

Read in full before coding:
- `og-requirements.md` (the contract) — sections R2 and R3
- `scenarios.md` (the testing contract — your S2.1-S2.12 rows)
- `project_specs.md` (architectural truth — § 5 module boundaries, § 9 known gotchas)
- `context-handoff.md` (post-B1 state — what exists, what NOT to touch, standing flag re: decisions/)
- **Legacy wire-format reference:** `legacy-poc/server.js:269-339` (ws.on('connection') handler and message handling). **Read this verbatim before drafting message shapes.** R3.7 requires byte-identical types + payload keys.

---

## Context (compressed from context-handoff.md)

Backend now has `backend/src/modules/auth/` working with SQLite + supertest + 7 green tests. The legacy app at port 4700 still serves voice.silverjrom.app — **do not disturb it**. New BE on port 4720 (PM2 `meet-poc-be`). B2 adds rooms CRUD + replaces the WS echo placeholder in `backend/src/server.ts` with the real knock/admit signaling protocol.

---

## Observed (current state)

**Legacy wire format reference (`legacy-poc/server.js`):**
- Lines 240-255 (`admitPeer`): owner-admit sends `{type:'admitted', clientId, peers, roomTitle, isOwner}` to admittee; sends `{type:'peer-joined', clientId, name}` to existing admitted peers; sends `{type:'knock-cancelled', clientId}` to owners.
- Lines 257-267 (`rejectPeer`): sends `{type:'rejected', reason}` to rejected client and closes; sends `{type:'knock-cancelled', clientId}` to owners.
- Lines 283-318 (`join` handling): owner auto-admit path → `{type:'admitted', clientId, peers, roomTitle, isOwner:true}` + initial `{type:'pending-list', knockers}` if pending exist; non-owner → `{type:'knocking', clientId, roomTitle}` + broadcast `{type:'knock', clientId, name}` to owners.
- Lines 321-329 (`signal`): admitted peers relay via `{type:'signal', from, data}` to the target's WS.
- Lines 331-338 (`admit`/`reject`): owner-only.
- Lines 341-357 (close handler): `{type:'peer-left', clientId}` to remaining admitted; `{type:'knock-cancelled', clientId}` to owners if peer was pending.

**Legacy room storage:** `data.rooms[id] = { id, title, ownerEmail, createdAt }` — straight JSON shape. We store this in SQLite as a `rooms` table in B2.

**Backend module conventions established in B1:**
- `getDb(dbPath?)` for DB acquisition
- `createApp(database)` factory pattern for testability
- Migrations in `backend/migrations/NNNN_*.sql`, idempotent (`CREATE TABLE IF NOT EXISTS`)
- Routers use Express `Router()` and are mounted under `/api` in `server.ts`

---

## Expected (acceptance criteria)

1. **Branch + commits:** create `feat/meet-rebuild-b2-rooms-signaling` off the current HEAD. Atomic commits (grouped by purpose: migration; rooms module; signaling module; tests; server wiring; artifacts).

2. **SQLite migration `backend/migrations/0002_rooms.sql`** — adds:
   ```sql
   CREATE TABLE IF NOT EXISTS rooms (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     owner_email TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     FOREIGN KEY (owner_email) REFERENCES users(email)
   );
   CREATE INDEX IF NOT EXISTS idx_rooms_owner ON rooms(owner_email);
   CREATE INDEX IF NOT EXISTS idx_rooms_created ON rooms(created_at);
   ```

3. **`backend/src/modules/rooms/index.ts`** — Express router exposing:
   - `POST /api/rooms` (auth required via session cookie) — body `{title}`, returns `{room: {id, title, ownerEmail, createdAt}}`. Title slice to 100 chars; default to `Room <ISO-date>` if empty.
   - `GET /api/rooms` (auth required) — returns `{rooms: [...]}` filtered by `owner_email` matching the authenticated user, ordered `created_at DESC`.
   - `DELETE /api/rooms/:id` (auth required) — 200 + `{ok:true}` if owner; 403 if non-owner; 404 if not exists.
   - `GET /api/rooms/:id/exists` (NO auth) — returns `{exists:true, title}` or `{exists:false}`.
   - Room ID generation: `crypto.randomBytes(6).toString('hex')` — 12 hex chars. Verify uniqueness via `INSERT OR IGNORE` retry pattern OR rely on extremely-low-collision probability with a single try.

4. **`backend/src/modules/rooms/store.ts`** (or similar internal helper) — `getRoom(id, db)`, `isOwnerOf(roomId, email, db)`, `listOwnedRooms(email, db)`, `createRoom(title, email, db)`, `deleteRoom(id, db)`. Pure SQLite, no HTTP concerns.

5. **`backend/src/modules/auth/middleware.ts`** (or extend existing) — `requireAuth(req, res, next)` middleware that reads the session cookie, calls `getSessionUser`, sets `req.user`, or returns 401. Mount on the rooms router for protected routes.

6. **`backend/src/modules/signaling/index.ts`** — replaces the echo placeholder in `server.ts`. Implements the knock/admit protocol. Module surface:
   - `attachSignaling(server: http.Server, database = getDb()): void` — installs the `/ws` upgrade handler.
   - Internal: per-room `LiveRoom` shape `{ admitted: Map<clientId, PeerEntry>, pending: Map<clientId, PeerEntry> }` (in-memory, like legacy).
   - Same `PeerEntry` shape as legacy: `{ ws, name, userEmail }`.
   - Reuse `parseCookies()` + `getSessionUser()` from B1 to identify the connecting user (for owner detection on `join`).
   - **Wire format byte-identical to legacy** for the 7 message types: `join`, `admitted`, `knocking`, `knock`, `peer-joined`, `signal` (both directions), `admit`, `reject`, `rejected`, `knock-cancelled`, `peer-left`, `error`, `pending-list`. (Codex MUST diff against legacy on its own — do not trust this list as complete; consult `legacy-poc/server.js` directly.)
   - **8-peer soft cap (R3.8):** before admitting (both auto-admit owner and manual admit), check `live.admitted.size >= 8`. If so: send `{type:'error', error:'room full (max 8)'}` to the joiner and close their socket. **Edge case:** if a 9th joiner is also the owner (not impossible — admitted peers include the owner), the count check still applies; the owner gets an error too. Document this trade-off in `changes.md`.

7. **Server wiring (`backend/src/server.ts`):** mount the rooms router under `/api`; call `attachSignaling(server, db)` after the HTTP server is created. **Remove the echo WS handler** entirely — the new signaling module owns `/ws`.

8. **Tests:**
   - `backend/tests/rooms.test.ts` — covers S2.1-S2.5 via supertest + real DB.
   - `backend/tests/signaling-auto-admit.test.ts` — covers S2.6 (owner auto-admit) using a 1-client ws harness against a real Express http.Server.
   - `backend/tests/signaling-knock-admit.test.ts` — covers S2.7, S2.8 (two-client harness: owner connects, guest knocks, owner admits or rejects).
   - `backend/tests/signaling-signal-relay.test.ts` — covers S2.9 (two admitted clients exchange signal payloads).
   - `backend/tests/signaling-peer-left.test.ts` — covers S2.10 (close → peer-left).
   - `backend/tests/signaling-room-full.test.ts` — covers S2.11 (8 admitted + 9th rejected with error).
   - `backend/tests/signaling-wire-format.test.ts` — covers S2.12: assert on the EXACT message shapes received by clients (object equality on `{type, …keys}`). Use a list of expected shapes derived from reading `legacy-poc/server.js`.

   Use `import { WebSocket } from 'ws'` in tests (or `ws` package). Start the Express http.Server on `:0` (random ephemeral port) per test; close at the end via the existing `afterEach` cleanup pattern.

9. **All scenarios S2.1-S2.12 must be green** when running `cd backend && npm test`. Existing S1.x must remain green.

## Likely files (summary)

```
backend/
├── migrations/
│   └── 0002_rooms.sql                     ← new
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   │   └── middleware.ts              ← new (requireAuth)
│   │   ├── rooms/
│   │   │   ├── index.ts                   ← new (Express router)
│   │   │   └── store.ts                   ← new (pure DB)
│   │   └── signaling/
│   │       └── index.ts                   ← new (replaces echo /ws)
│   └── server.ts                          ← updated (mount rooms, attachSignaling)
└── tests/
    ├── rooms.test.ts                      ← new (S2.1-S2.5)
    ├── signaling-auto-admit.test.ts       ← new (S2.6)
    ├── signaling-knock-admit.test.ts      ← new (S2.7, S2.8)
    ├── signaling-signal-relay.test.ts     ← new (S2.9)
    ├── signaling-peer-left.test.ts        ← new (S2.10)
    ├── signaling-room-full.test.ts        ← new (S2.11)
    └── signaling-wire-format.test.ts      ← new (S2.12)
```

## Scope (hard limits — surgical only)

- **DO** the items in Expected.
- **DO NOT** start frontend (`frontend/` is B3).
- **DO NOT** implement recording (`/upload` is B5).
- **DO NOT** modify `legacy-poc/` (except reading for the wire-format reference).
- **DO NOT** touch CF Tunnel, the legacy `meet-poc` PM2 entry, or restart any PM2 process.
- **DO NOT** introduce a new persistence layer or schema beyond `0002_rooms.sql`. Sessions + users already exist (B1); rooms is the only new table.
- No "while I'm in here" scope creep.

## Required artifacts (under `plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-2/`)

Create folder `plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-2/` and produce:

1. **`changes.md`** — Codex template (User Report verbatim + Root Cause mechanism + Code Changes per-file WHY + Modules touched + Caveats).
2. **`scenarios-implemented.md`** — one row per S2.1-S2.12 with PASS/FAIL + test-file + 1-line evidence.
3. **`test-report.md`** — `npm test` output, test counts, flakes.
4. **`review.md`** — your 1-paragraph self-review.
5. **`independent-validation.md`** — fresh-eyes re-read.
6. **`screenshots/`** — empty (no UI yet).
7. **DECISIONS — IMPORTANT (gate-7 reminder):**
   - For every non-trivial autonomous call (variant chosen between alternatives, scope decision, workaround), write a file `projcore-run-2026-05-19/decisions/2026-05-19-b2-<slug>.md` with frontmatter `type: autonomous-call, source: codex-implementer, batch: B2`.
   - If you made zero non-trivial calls, state **explicitly in `changes.md`** "Autonomous decisions: none — all choices matched projcore brief defaults."
   - **Soft flag carried from B1:** putting decisions only in `changes.md§Autonomous Decisions` (without a per-run decision file) is gate-7 partial-fail territory. Use the proper folder this time.

## Completion protocol

End your final reply with one of:

```
STATUS: DONE — B2 rooms + signaling complete, S2.1-S2.12 green, wire format identical to legacy
```
```
STATUS: BLOCKED — <specific blocker>
```
```
STATUS: NEEDS-INFO — <specific question for projcore>
```

**Also append to** `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/progress.md` AND `callbacks.md`:

```
[projcore callback] batch-2 DONE — rooms CRUD + signaling protocol + 12 scenarios green
```

(or BLOCKED / NEEDS-INFO as appropriate)

## Confirmation-prompt protocol (mandatory)

If you hit any tool-confirmation prompt — BEFORE waiting, append to callbacks.md:

```
[projcore NEEDS-CONFIRM] <one-line command summary> — awaiting projcore approval
```

THEN wait.

## Model + reasoning guidance

- Most of B2 is straightforward — direct port of legacy WS handlers into TS modules.
- The WS test harness is the slightly trickier part; use small focused per-scenario specs (one scenario per test file) rather than one mega-test, to make failure isolation easier.
- Cost-aware tier is fine. Escalate to higher reasoning ONLY if the 8-peer cap edge cases or wire-format-identity bookkeeping starts requiring deeper analysis.
- **Wire format identity is the most-likely-to-FAIL-validation surface.** Read `legacy-poc/server.js` once thoroughly; cite line numbers in `changes.md` for each message-shape decision so /projcore can cross-check fast.

— /projcore (Claude, Opus, 2026-05-19)
