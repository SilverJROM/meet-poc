# context-handoff.md — meet-poc v2 Run 1

---

## Pre-B2 handoff (post-B1 PASS)

**HEAD:** `feat/meet-v2-b1-sessions-backend` (commit `884c26d docs: append v2 batch 1 callback`)
**Branch for B2:** `feat/meet-v2-b2-host-authority` — off the B1 HEAD.

**What's in the repo now (post-B1):**
- `backend/` — 5 modules now (auth, rooms, signaling, recording, **sessions**). 15 vitest files / 31 tests green.
- `backend/migrations/0003_meeting_sessions.sql` applied; runtime DB has the table.
- `backend/src/modules/sessions/{index,store}.ts` — exports `openSession`, `getOpenSessionFor`, `getOpenSessionByRoom`, `closeSession`, `bumpPeak`, `listActiveForOwner`, `listEndedForOwner`, plus `MeetingSession` type.
- `backend/src/modules/signaling/index.ts` — lifecycle hooks: opens session on first `join`, bumps peak on admits, closes on `last-peer-left` / `host-disconnect-empty`. **Does NOT YET close on `host-end`** — that's B2.
- `backend/src/modules/signaling/index.ts` — `getHostClientId(roomId)` helper EXPORTED (B1 added; B2 first user).
- Live PM2 BE picked up the changes via tsx-watch (verified live API + WS smoke).

**WS protocol available today (post-B1):**
- Same as post-rebuild + B1 added internal lifecycle (no new wire-format messages — those land in B2).

**B2 introduces these wire-format additions:**
- Client → server:
  - `{type:'recording-state', state:'started'|'stopped'}` — host's client tells server when local MediaRecorder starts/stops
  - `{type:'meeting-ended-by-host'}` — host-only command
  - `{type:'mute-target', clientId}` — host-only command
  - `{type:'remove-peer', clientId}` — host-only command
- Server → broadcast / direct:
  - `{type:'recording-started', clientId, sessionId}` — broadcast to all admitted on host's `recording-state:started`
  - `{type:'recording-stopped', clientId, sessionId}` — broadcast to all admitted on host's `recording-state:stopped`
  - `{type:'meeting-ended', reason}` — broadcast to all admitted on host's `meeting-ended-by-host`
  - `{type:'mute-request', from}` — direct to the targeted peer on host's `mute-target`
  - `{type:'peer-removed', reason}` — direct to the targeted peer on host's `remove-peer`

**What B2 must produce:**
- `backend/src/modules/recording/index.ts` — auth + ownership + session-binding for `/upload`; backward-compat filename parser.
- `backend/src/modules/signaling/index.ts` — handlers for `recording-state`, `meeting-ended-by-host`, `mute-target`, `remove-peer` with host validation + audit-via-stdout for non-host attempts.
- Tests: update `recording.test.ts` for new auth gates + add `signaling-host-actions.test.ts`.

**Standing flags:**
- Commit BEFORE STATUS: DONE.
- §1.15 — decisions/2026-05-19-v2-b2-<slug>.md for non-trivial autonomous calls.
- §2.10 — real DB + real ws clients.
- Hygiene — no prod-DB pollution in tests.

**Decisions already locked (do not re-litigate):**
- /upload is now authenticated (REVERSES v1 B5 trade-off — documented in plan-locked decision file).
- X-Room is a hint, not trust; cookie + DB ownership is.
- Mute = soft request, Remove = hard force-close.
- Non-host commands dropped silently with info log.
- No `audit_events` DB table.

**Live service:** voice.silverjrom.app on PM2 :4700. tsx-watch picks up backend changes automatically.

**Active callback target:** `plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/callbacks.md` + `progress.md`.
