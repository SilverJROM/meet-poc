# Batch Admit Changes

## Scope
- branch/checkpoint: `fix/meet-conn-diag`
- commit: `fix(meet): admit drops without readmit`

## Files Changed
- `backend/src/modules/signaling/index.ts`
- `backend/tests/signaling-reconnect.test.ts`
- `frontend/src/app/services/ws.service.ts`
- `frontend/src/app/pages/room/room.page.ts`
- `e2e/tests/v3-admit/admit.spec.ts`

## User Report
APPROVED-PLAN: DR-39 whole-meeting no-re-admit after drops only, and DR-38 explicit Exit-vs-drop behavior. Only the explicit `{ type: 'leave' }` message may revoke membership/remove the card; any bare socket close code/reason is a drop. Re-admit after a revoked return must clear the revoke so subsequent drops are seamless again.

## Root Cause
- `RoomPage.cleanupCall()` sent `{ type: 'leave' }` for both button-driven leave and page lifecycle cleanup. Refresh/reload/pagehide/beforeunload therefore looked like deliberate leave.
- `WsService.close()` also encoded explicit leave through WebSocket close code/reason, and the server treated that close event as leave. That allowed non-message closes to remove the card and revoke membership.
- Server join policy reused the DR-37 identity but did not yet implement the DR-39 admitted-client auto-admit policy after reconnect grace.

## What Changed
- Added a `revoked` policy flag to room-lifetime `clientIdentities`.
- Server revocation now occurs only inside `msg.type === 'leave'`, never inside the `close` event.
- Explicit leave removes the card immediately and marks the `clientKey` as revoked/not admitted.
- Owner re-admit writes `wasAdmitted=true` and clears `revoked`, restoring seamless future drops.
- Join now auto-admits a known, non-revoked, previously admitted `clientKey`, including after reconnect grace/token expiry.
- `WsService.close()` is now a neutral socket close with no explicit-leave close code/reason.
- Room page sends `{ type: 'leave' }` only from the Leave/Exit button path; page lifecycle cleanup and host-removal/meeting-ended cleanup do not send it.

## Self-Verification
- `npm test -w backend -- signaling-reconnect.test.ts`: PASS, 11/11
- `npm run build`: PASS
- `MEET_DB_PATH=/tmp/meet-poc-admit.sqlite ... E2E_BASE_URL=http://localhost:4820 npm test -w e2e -- tests/v3-admit/admit.spec.ts --config=playwright.config.ts --workers=1`: PASS, 2/2
- `npm test -w backend -- signaling-auto-admit.test.ts signaling-knock-admit.test.ts signaling-peer-left.test.ts signaling-waiting-room.test.ts signaling-wire-format.test.ts`: PASS, 11/11
- `MEET_DB_PATH=/tmp/meet-poc-admit-regress.sqlite ... npm test -w e2e -- tests/v3-reconcile/reconcile.spec.ts tests/v3-audiofix/audiofix.spec.ts --config=playwright.config.ts --workers=1`: PASS, 3/3

## Evidence
- `screenshots/reload-drop-auto-admit.png`
- `screenshots/explicit-exit-card-removed.png`
- `screenshots/post-readmit-drop-auto-resume.png`

## Env Hygiene
- `/tmp` DBs were pre-seeded and used inline only.
- Isolated ports `4820`, `4821`, and `4830` had no listeners after Playwright shutdown.
- Shell env has no `MEET_DB_PATH`, `MEET_RECORDINGS_DIR`, or `E2E_*` exports.
- pm2 `meet-poc-be` and `meet-poc-fe` are online with no `MEET_DB_PATH` / `MEET_RECORDINGS_DIR` leak.

## Autonomous Decisions
- none

## Caveats
- none
