# context-handoff.md — meet-poc v2 Run 1

---

## Pre-B1 handoff (run start)

**HEAD at run start:** `feat/meet-rebuild-b6-cutover` (the chain of v1 commits ending with `ae1ec40 docs: append batch 6 callback` — clean tree, live serving voice.silverjrom.app)
**Branch for B1:** `feat/meet-v2-b1-sessions-backend` — codex creates off the current HEAD.

**What's in the repo (post-v1, pre-v2):**
- `backend/` — TS workspace, 4 modules (auth, rooms, signaling, recording). 13 vitest files / 23 tests green. Live on port 4720.
- `frontend/` — Angular 20 SPA: login, dashboard (single page with create + rooms + recordings sections), room (lobby + call with one-row `auto-fit minmax(260px, 1fr)` grid). Live on port 4700 (NODE_ENV=production via scripts/serve.js dist mode).
- `e2e/` — 4 test batches (b3-shell-auth, b4-call-ui, b5-recording, b6-cutover). 20 specs green.
- `legacy-poc/` is DELETED. `coturn` is NOT installed.
- Live `voice.silverjrom.app` serves the Angular app via Cloudflare token-tunnel → :4700.
- Live DB state: 1 room (`TEST_ROOM01`, owner jrom). 0 recordings. (Cleaned this turn before run start.)

**WS protocol available today (post-v1):**
- Client → server: `join`, `signal`, `admit`, `reject`
- Server → client: `admitted`, `knocking`, `knock`, `pending-list`, `peer-joined`, `peer-left`, `knock-cancelled`, `signal`, `rejected`, `error`

**v2 additions B2 will introduce:**
- Client → server: `recording-state {state:'started'|'stopped'}`, `meeting-ended-by-host`, `mute-target {clientId}`, `remove-peer {clientId}`, `media-state {mic, cam}`
- Server → client: `recording-started/stopped {clientId, sessionId}`, `meeting-ended {reason}`, `mute-request {from}`, `peer-removed {reason}`, `media-state {clientId, mic, cam}`

**What B1 must produce:**
- `backend/migrations/0003_meeting_sessions.sql` (the table + 3 indexes)
- `backend/src/modules/sessions/{index.ts, store.ts}` — REST router + pure DB helpers
- `backend/src/modules/signaling/index.ts` — extend with lifecycle hooks (open session on first join, update admitted_peak, close on triggers in R1.3). NEW helper `getOpenSessionFor(roomId, hostEmail)` and `getHostClientId(roomId)`.
- `backend/src/server.ts` — mount the sessions router under `/api`
- Auto-migration on startup picks up 0003.
- `backend/tests/sessions-*.test.ts` — 8 specs S1.1-S1.8

**Standing flags:**
- §1.15 — write `decisions/2026-05-19-v2-b1-<slug>.md` for non-trivial autonomous calls; explicit "none — defaults matched" in changes.md if zero
- **Commit before STATUS: DONE callback** (rule from v1 B4 closure)
- §2.10 validator discipline — vitest with real DB + real ws clients; no mocks
- **NEW (carried from cleanup):** every test that creates rooms/sessions must clean them in afterEach (or use temp-DB sandbox); pollution of prod SQLite is what caused the 95-room mess earlier
- **Soft hygiene:** session row idempotency — if a row already exists for this (room_id, started_at within 1s, ended_at NULL), reuse don't create. Don't create dupe rows on rapid sequential joins.

**Decisions already locked (do not re-litigate):**
- No `audit_events` table (Claude-peer drop; use PM2 logs)
- Session open on first WS join (any peer); close on host-end OR last-peer-leave OR host-disconnect-empty
- `/upload` cookie-trust + bound to open `meeting_session_id` (B2 wires)
- Pattern X for lobby pre-grant (B5 wires)
- 30s socket-keepalive for re-admit is a B8 concern (NOT a session-row concern)
- Backward-compat for `/api/rooms` (no pagination params = legacy shape)

**Live service:** voice.silverjrom.app on PM2 `meet-poc-fe` (:4700) + `meet-poc-be` (:4720). **Do NOT restart legacy or disturb live mid-batch unless required** (tsx watch picks up backend changes; ng builds require `pm2 restart meet-poc-fe` after `npm run build -w frontend`).

**Active callback target:** `plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/callbacks.md` (append) + `progress.md` (append under Callbacks log).
