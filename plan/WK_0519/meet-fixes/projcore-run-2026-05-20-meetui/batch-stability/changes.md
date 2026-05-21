# Batch STABILITY Changes

## User Report
JROM: "she gets dropped on my call and I get dropped on hers, and I need to RESTART THE ROOM to resume."

## Root Cause
The existing recovery path stopped at ICE restart. Once a peer connection reached terminal `failed` after `MAX_ICE_RESTART_ATTEMPTS`, the app recorded diagnostics but had no last-resort self-heal. A separate signaling reconnect could resync the room, but a terminal RTCPeerConnection could remain stranded until the room was restarted.

## Changes

- `frontend/src/app/services/webrtc.service.ts`
  - Extracted peer-connection creation into a reusable lifecycle helper so normal add/resume and DR-40 recreate share event handlers, senders, forensics, and policy application.
  - Added guarded PC recreation only for terminal `failed` after 3 exhausted ICE restarts.
  - Added consecutive recreate cap with debounce/backoff and sustained-good reset after healthy samples.
  - Recreate preserves `participantId`, peer stream shell, local tracks, DR-13 audio priority, DR-42 video policy, and DR-34 audio sink compatibility.
  - Added reconnect/resume yielding: pending PC recreate is cancelled when a peer enters reconnecting/resume flow.
  - Added negotiation watchdog plus rollback/re-offer and polite glare rollback diagnostics.
  - Fills DR-43 `autoRecoveryOutcome` as `recovered` or `failed`.
- `frontend/src/app/pages/room/room.page.ts`
  - Makes WS reopen explicitly resync room state by re-sending join with existing clientKey/reconnect token.
  - Adds localhost-only debug hooks used by focused E2E tests.
- `frontend/src/app/services/meeting-sessions.service.ts`
  - Types `autoRecoveryOutcome` as `recovered | failed | null`.
- `e2e/tests/v3-stability/stability.spec.ts`
  - Adds DR-40 tests for terminal PC recreate, glare/deadlock rollback, and WS reconnect/resync.
- `e2e/tests/v3-identity/identity.spec.ts`
  - Updates stale DR-37 expectation to match DR-39: drops keep one reconnecting/resumed tile and auto-resume by clientKey without manual re-admit.

## Autonomous Decisions
See `../decisions/2026-05-21-dr37-test-contract-after-dr39.md`.
