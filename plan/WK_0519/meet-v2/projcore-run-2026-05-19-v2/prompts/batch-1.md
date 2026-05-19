# Batch v2-B1 — Backend: meeting_sessions + lifecycle + paginated API

**Persona switch:** Invoke `$lead`. You are NOT `$projcore`. Claude `/projcore` supervises.

**Batch ID:** v2-B1
**Plan:** `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-v2/implementation-plan.md`
**Branch:** `feat/meet-v2-b1-sessions-backend` — off the current HEAD (`feat/meet-rebuild-b6-cutover` tip, ae1ec40 or its descendant — clean tree, live serving voice.silverjrom.app).

**Requirements assigned (verbatim from og-requirements.md):**
- **R1.1** — Migration 0003: `meeting_sessions` table + 3 indexes
- **R1.2** — Session opens on first WS-join; idempotent within room
- **R1.3** — Session closes on `host-end` OR `last-peer-left` OR `host-disconnect-empty`
- **R1.4** — `admitted_peak` tracks high water mark
- **R1.5** — `GET /api/meeting-sessions?status=&page=&pageSize=` — active sessions OR ended-with-filter (`admitted_peak >= 1 AND duration >= 10s`)
- **R1.6** — Helper `getOpenSessionFor(roomId, hostEmail)` returns the currently open session row or null

Read in full before coding:
- `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-v2/og-requirements.md` (R1 section + Hygiene rule at the bottom)
- `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-v2/scenarios.md` (S1.1-S1.8 — your contract)
- `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/context-handoff.md` (post-v1 state)
- `/home/agjrom/websites/meet-poc/project_specs.md` (architectural truth)
- Existing signaling module: `backend/src/modules/signaling/index.ts` — you'll add lifecycle hooks here
- Existing pattern: `backend/src/modules/rooms/{index.ts, store.ts}` — mirror the split (router + pure DB helpers)

---

## Context (compressed)

v1 rebuild closed 49/53 VERIFIED. Live at voice.silverjrom.app. Backend has 4 modules (auth, rooms, signaling, recording) and 13 vitest files / 23 tests green. v2 Run 1 adds a `meeting_sessions` entity that ties together rooms (the schedulable thing) with actual occurrences-of-people-gathering (the things you can list under "Past meetings", attach recordings to, query "what's ongoing right now").

Codex-pushback + Claude-peer-pushback both agree:
- Session opens on **first WS-join** (any peer, including host). NOT "first admit" (would miss solo-host-recording case).
- Session closes on **first** of: `host-end` (R2 wires), `last-peer-left` (admitted+pending both reach 0), OR `host-disconnect-empty` (host's WS closes while admitted_count already 0 — handles "host opened then closed alone").
- **No `audit_events` table.** PM2 stdout/stderr logs are the audit trail for this single-user app.
- Past-sessions filter `admitted_peak >= 1 AND duration >= 10s` — prevents junk rows from rejected/abandoned joins.

---

## Expected (acceptance criteria)

### Step 1 — Migration `backend/migrations/0003_meeting_sessions.sql`

```sql
CREATE TABLE IF NOT EXISTS meeting_sessions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  host_email TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  ended_reason TEXT,
  admitted_peak INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_room ON meeting_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON meeting_sessions(ended_at);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON meeting_sessions(started_at);
```

Idempotent (`CREATE TABLE IF NOT EXISTS`). Auto-applied on backend boot per existing `runMigrations()` flow.

### Step 2 — Pure DB helpers `backend/src/modules/sessions/store.ts`

Export:
- `openSession(roomId, hostEmail, db)` — creates a new row with uuidv4 id, `started_at=Date.now()`, `admitted_peak=0`. Returns the row. Idempotent guard: if an `ended_at IS NULL` row already exists for this `room_id` AND `started_at` within the last 2 seconds, return it instead.
- `getOpenSessionFor(roomId, hostEmail, db)` — returns the open row for this (room, host) pair, or null. (Bumping the host_email gate: even if a session is open for a room, this returns null if the host doesn't own the room — the recording-binding flow in B2 uses this.)
- `getOpenSessionByRoom(roomId, db)` — returns the open row for this room regardless of host (for lifecycle internal use). Returns null if none.
- `closeSession(sessionId, reason, db)` — sets `ended_at=Date.now()` + `ended_reason`. No-op if already closed.
- `bumpPeak(sessionId, currentAdmittedCount, db)` — if `currentAdmittedCount > admitted_peak`, updates the row. Else no-op.
- `listActiveForOwner(ownerEmail, db)` — JOIN with rooms to filter by owner; returns active rows.
- `listEndedForOwner(ownerEmail, page, pageSize, db)` — JOIN with rooms; WHERE `ended_at IS NOT NULL AND admitted_peak >= 1 AND (ended_at - started_at) >= 10000`; ORDER BY started_at DESC; LIMIT/OFFSET. Returns `{rows, total}`.

`uuidv4`: use Node's `crypto.randomUUID()` (no new dep).

### Step 3 — REST router `backend/src/modules/sessions/index.ts`

`GET /api/meeting-sessions?status=&page=&pageSize=` (auth required via existing `requireAuth` middleware):
- `status=active`: returns `{sessions, total}` where sessions = `listActiveForOwner(req.user.email)` mapped to API shape (id, room_id, room_title, host_email, started_at_iso, admitted_peak). No pagination on active (small list).
- `status=ended`: requires `page` (default 1) + `pageSize` (default 20, max 100). Returns `{sessions, page, pageSize, total}` with sessions mapped likewise + `duration_ms`.
- Invalid status → 400.

API shape:
```typescript
{
  sessions: Array<{
    id: string;
    roomId: string;
    roomTitle: string;
    hostEmail: string;
    startedAtIso: string;       // ISO from started_at
    endedAtIso?: string;        // when status=ended
    endedReason?: string;       // when status=ended
    admittedPeak: number;
    durationMs?: number;        // when status=ended
  }>,
  page?: number,
  pageSize?: number,
  total: number
}
```

Mount under `/api` in `backend/src/server.ts` (next to rooms and recording routers).

### Step 4 — Signaling lifecycle hooks `backend/src/modules/signaling/index.ts`

Extend the existing module. Add:

- **On `join` (after the existing room-not-found / room-full checks pass):** call `openSession(roomId, room.ownerEmail, db)` to ensure a session is open. Hold the `sessionId` on the local `LiveRoom` struct (add a `currentSessionId: string | null` field). The session is the same for all peers in the room — open once, reuse.

- **After `live.admitted.set(clientId, entry)` adds a new admitted peer (both owner-auto-admit path AND `admitPeer()` for guests):** call `bumpPeak(currentSessionId, live.admitted.size, db)`.

- **In `ws.on('close')` handler** — after the existing `peer-left` broadcast (admitted case) or `knock-cancelled` (pending case), check if `live.admitted.size === 0 && live.pending.size === 0`. If so:
  - If the closing peer was the host AND `live.admitted.size` was already 0 before their close: `closeSession(currentSessionId, 'host-disconnect-empty')`.
  - Otherwise: `closeSession(currentSessionId, 'last-peer-left')`.
  - Then delete the LiveRoom entry (existing behavior preserves this).

- **Helper `getHostClientId(roomId)`:** scans `liveRooms.get(roomId).admitted` for an entry where `entry.userEmail === room.owner_email` and returns its `clientId`. Returns null if no host admitted. (Used by B2; B1 just defines + exports it.)

**Do NOT** wire `meeting-ended-by-host` here — that's B2's `host-end` reason close. B1 covers the other two close reasons + opens.

### Step 5 — Tests `backend/tests/sessions-*.test.ts`

8 specs matching scenarios S1.1-S1.8. Use the existing `createTestDb()` helper + the existing ws-client harness from `tests/signaling-helpers.ts` (factored from B2's harness).

- `sessions-lifecycle.test.ts` — S1.1 (open on first join, idempotent), S1.2 (admitted_peak high water), S1.3 (close on host-end is in B2, but verify here that host-end doesn't fire when only host present + leaves alone), S1.4 (close on last-peer-left), S1.5 (close on host-disconnect-empty)
- `sessions-api.test.ts` — S1.6 (active listing), S1.7 (ended filter), S1.8 (pagination)

Note S1.3 in B1: only verify the **lifecycle close on `last-peer-left` and `host-disconnect-empty` triggers** — the `host-end` close-trigger code path is added in B2 (when `meeting-ended-by-host` WS command lands). For B1's S1.3, test what's testable (force-close from a non-host disconnect after they were the last admitted) + leave a TODO referencing B2 for the host-end leg.

**Hygiene:** all tests must use `createTestDb()` (temp file, NOT prod) and `afterEach` cleanup as already established. Real ws clients, real Express via supertest, no mocks.

## Required artifacts

Under `plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-1/`:

1. `changes.md` — Codex template (User Report + Root Cause mechanism + Code Changes per-file + Modules Touched + Caveats + Autonomous Decisions)
2. `scenarios-implemented.md` — S1.1-S1.8 with PASS/FAIL + test path + 1-line evidence
3. `test-report.md` — `npm run build` + `cd backend && npm test` output, regression on prior 23 backend tests
4. `review.md` — self-review APPROVE/REJECT paragraph
5. `independent-validation.md` — fresh-eyes re-read of own diff
6. `screenshots/` — empty (no UI in B1)
7. **Decisions:** `projcore-run-2026-05-19-v2/decisions/2026-05-19-v2-b1-<slug>.md` for any non-trivial autonomous calls (e.g. how to plumb `currentSessionId` on the LiveRoom struct, idempotency window choice, the S1.3 partial coverage note). If truly no autonomous calls, explicitly state "Autonomous decisions: none — defaults matched" in changes.md.

## Scope (hard limits — surgical only)

- **DO** items in Expected.
- **DO NOT** implement `meeting-ended-by-host` close trigger — B2.
- **DO NOT** implement /upload binding to session — B2.
- **DO NOT** add WS broadcasts (recording-started/stopped, media-state, etc.) — B2.
- **DO NOT** touch frontend.
- **DO NOT** create an `audit_events` table.
- **DO NOT** restart legacy or disturb live state beyond `tsx watch` automatic backend reload.
- **DO NOT** pollute prod SQLite — use temp DBs in tests.

## Completion protocol

End your reply with:
```
STATUS: DONE — v2-B1 sessions + lifecycle + API + 8 scenarios green
```
OR `BLOCKED — <reason>` OR `NEEDS-INFO — <question>`.

**Commit BEFORE STATUS: DONE** (rule from v1 B4). Working tree must be clean when the callback lands. Atomic commits grouped by purpose (e.g. "feat: add meeting_sessions migration + store", "feat: wire signaling lifecycle hooks", "test: add session lifecycle + API specs", "docs: add batch 1 evidence").

Append to `/home/agjrom/websites/meet-poc/plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/progress.md` AND `callbacks.md`:
```
[projcore callback] v2-batch-1 DONE — meeting_sessions + API + 8 scenarios green
```

## Confirmation-prompt protocol — minimal expected

B1 is pure-backend + tests. No sudo, no live edits. Confirmation protocol only fires on something unexpected.

## Model + reasoning guidance

- Straightforward TS scaffolding + SQL + vitest. Cost-aware tier fine.
- The lifecycle hook surgery in `signaling/index.ts` is the subtlest part — three close-reason triggers + idempotent open + admitted_peak bump. Test these carefully via the ws-client harness from rebuild B2.
- The S1.3 partial coverage point: keep B1's lifecycle tests focused on the two triggers B1 wires (`last-peer-left`, `host-disconnect-empty`). The third trigger (`host-end`) lands in B2; flag in changes.md.

— /projcore (Claude, Opus, 2026-05-19)
