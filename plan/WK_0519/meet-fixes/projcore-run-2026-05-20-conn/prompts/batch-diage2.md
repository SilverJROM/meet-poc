Batch-DIAGE2: Host open/close toggle + waiting room (DR-16)

Batch ID: diage2
Requirements: DR-16 (full text in plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/og-requirements.md)
Branch: continue on fix/meet-conn-diag.

**Protocol: projcore v2.0.** Plan handshake first (STATUS: PROPOSED → wait for APPROVED-PLAN → code). Final action of every STATUS reply: append `[projcore callback] diage2 <STATE> <note>` to the run callbacks.md. End every reply with `STATUS: <verb> — <reason>`.

**⚠️ ENV-HYGIENE HARD RULE (incident 2026-05-20):** an earlier batch leaked `MEET_DB_PATH`/`MEET_RECORDINGS_DIR` into the live pm2 backend by exporting them then `pm2 restart`, corrupting the live app. For THIS batch: if you validate on an isolated DB, do NOT leave those vars exported when you restart the live service. After validation, restart the live service ONLY via `pm2 start ecosystem.config.js` (or `pm2 restart` from a shell with those vars UNSET). The live pm2 env must end with ONLY PORT + NODE_ENV (no MEET_DB_PATH/MEET_RECORDINGS_DIR). Projcore will verify.

## DR-16 — Host open/close + waiting room (answers locked)

JROM answers: host-opened = **explicit toggle** (room stays open until host closes, independent of presence); wait-time = **host-set per room, default 15 min**; guest reconnect restarts the timer.

Model:
- Add per-room `is_open` (default CLOSED — host must explicitly open) + `wait_timeout_minutes` (default 15, host-configurable). Migration + backfill (existing rooms default closed + 15).
- **Host controls:** an Open/Close room toggle (host/owner only — in-room and/or on the rooms list) + a wait-timeout setting (room create and/or settings).

Guest connect behavior:
- **Room CLOSED:** show "This room hasn't been opened by the host yet" + a countdown of `wait_timeout_minutes`. On timeout → disconnect/kick the guest with a clear message. Guest may reconnect → timer restarts.
- **Room OPEN:** unlimited wait, show "The host is available — please wait to be admitted" + the normal knock/admit flow (no timeout).
- The OWNER opening their own room is unaffected by the wait (owner always enters; see DR-21).

## Observed (confirm by reading)

- `backend/src/modules/rooms/store.ts` + `index.ts` — room schema (now has slug from DIAGE1); add is_open + wait_timeout_minutes + endpoints (toggle open/close, set wait-timeout — owner-gated).
- `backend/migrations/` — next migration (0006) for is_open + wait_timeout_minutes + backfill.
- `backend/src/modules/signaling/index.ts` — the join/knock/admit flow; gate guest entry on room open-state; closed-room timed-wait + kick; reuse DR-18/DR-22 grace where relevant; owner bypass (DR-21).
- `frontend/src/app/pages/room/room.page.{ts,html}` — waiting-room UI states (not-opened + countdown vs host-available + admit), kick handling, reconnect-restarts-timer.
- `frontend/src/app/pages/rooms/rooms.page.*` — host open/close toggle + wait-timeout setting on the rooms list (owner only).

## Scope

- DR-16 only.
- Do NOT regress DR-1..DR-15, DR-17..25, FIXC work, or the DIAGF reconnect/grace logic.
- Owner auto-admit (DR-21) must still hold — owner is never blocked by the closed-room wait.
- Surgical.

## Plan handshake (MANDATORY)

STATUS: PROPOSED with: the is_open/wait_timeout schema + migration/backfill, the open/close + wait-timeout endpoints (owner-gated), the signaling gate for closed vs open rooms, the closed-room countdown + kick + reconnect-restart mechanism, how it composes with DR-18/DR-21/DR-22 (owner bypass, grace), the waiting-room UI states, planned files, risks. Append callback. Wait for APPROVED-PLAN.

## Tests

- Backend: closed room + guest → kicked after wait_timeout (use a short timeout in test); reconnect restarts; open room → no timeout, normal admit; owner enters closed room without wait; toggle open/close owner-gated (non-owner rejected); wait-timeout setting owner-gated.
- Playwright: closed room shows not-opened + countdown; open room shows host-available + admit flow; host toggle flips state + guest experience changes.

## Required artifacts at plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diage2/

changes.md, scenarios.md, review.md, test-report.md, screenshots/{room-closed-waiting.png, room-open-admit.png, host-open-toggle.png}, independent-validation.md, decisions/<date>-*.md (or "none").

## Build + deploy

- Backend + frontend build PASS; backend tests PASS; new e2e PASS; full Run-1 + diag gate PASS on a clean/isolated DB. Migration runs cleanly on live DB (existing rooms → closed + 15min default), TEST_ROOM01 still works.
- pm2 restart per the ENV-HYGIENE rule above (clean env, verify no /tmp leak).
- Clean up any test rooms you create (keep TEST_ROOM01).

## Completion

COMMIT BEFORE STATUS: DONE. End with `STATUS: DONE — <reason>` + append `[projcore callback] diage2 DONE <note>` to callbacks.md.
