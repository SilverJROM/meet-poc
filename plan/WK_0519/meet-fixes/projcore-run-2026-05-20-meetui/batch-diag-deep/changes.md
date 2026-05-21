# DR-41 Changes

## User Report

"The first captured US call only logged the OWNER's side. DR-41: ALL admitted participants post diagnostics (guests too, membership-checked), owner-gated VIEW unchanged + a settings toggle (default ON, localStorage) to disable logging."

## Root Cause

Diagnostics posting was owner-gated in the room client and required authenticated owner API access on the backend. Guests could be admitted to a session but still could not persist their side of diagnostics. There was also no local setting to disable diagnostics logging once the call flow was stable.

## Implementation

- `frontend/src/app/pages/room/room.page.ts`: removed owner-only diagnostics posting gates; added `participantId` and durable `clientKey` to every diagnostics payload; added default-ON `meet-poc.diagnosticsLogging` localStorage toggle checked before interval, beacon, and queued posts.
- `frontend/src/app/pages/room/room.page.html`: added the diagnostics logging toggle beside Force relay in the connection diagnostics panel.
- `frontend/src/app/pages/room/room.page.scss`: added compact wrapping layout for diagnostics controls.
- `frontend/src/app/services/meeting-sessions.service.ts`: typed `participantId` and `clientKey` on diagnostics payloads.
- `backend/src/modules/signaling/index.ts`: exported read-only diagnostics membership validation against the live session admitted/reconnecting peers and durable client identity map.
- `backend/src/modules/sessions/index.ts`: changed diagnostics POST to optional auth plus mandatory admitted-member validation; diagnostics viewing remains owner-auth gated.
- `backend/src/modules/sessions/store.ts`: allowed validated guest writes to be stored under the room owner so owner-gated views/downloads remain unchanged.
- `backend/tests/session-diagnostics.test.ts`: added route-level owner, admitted guest, and never-admitted rejection coverage.
- `e2e/tests/v3-dr41-diagnostics/dr41-diagnostics.spec.ts`: added two-peer browser coverage proving owner+guest rows and toggle-off stop behavior.

## Autonomous Decisions

None.
