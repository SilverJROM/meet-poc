# Batch B11 Changes

## User Report

"SFU RTCPeerConnection has NO oniceconnectionstatechange/onconnectionstatechange recovery; reconnect republish is one-shot."

## Root Cause

`SfuClientService.doPublish()` created the SFU `RTCPeerConnection` without transport state handlers, so failed ICE/PC state could leave signaling connected while media stayed dead. `RoomPage` also used one-shot SFU publish after signaling reconnect, bypassing the B09 bounded retry path.

## Code Changes

- `frontend/src/app/services/sfu-roster-utils.ts` — Added pure `planSfuTransportRecovery()` decision helper for failed/disconnected/connected/capped transport states.
- `frontend/src/app/services/sfu-client.service.ts` — Added SFU transport state handlers, 8s disconnected grace, serialized guarded recovery, ICE restart renegotiation, and clean full-republish fallback that preserves remote publisher roster for resubscribe.
- `frontend/src/app/pages/room/room.page.ts` — Registered the full-republish callback, routed reconnect republish through B09 retry, and republished active screen tracks before B06 announce.
- `frontend/src/app/services/sfu-client.spec.ts` — Added pure recovery planner coverage for failed, disconnected grace, connected reset, and cap/backoff.

## Verification

- PASS: `npx tsx frontend/src/app/services/sfu-client.spec.ts`
- PASS: `npm run build -w frontend`

## Caveats

- VALIDATION LIMITATION: Real Wi-Fi/cellular handoff was not exercised locally; that still needs a JROM seat/network-change run.
