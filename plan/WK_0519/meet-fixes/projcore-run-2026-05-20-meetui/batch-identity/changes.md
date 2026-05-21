# DR-37 Changes

## User Report
Triangulated first captured US call, session 39f8a28d: the US peer appeared as 8 different participantIds in 11 minutes. Every drop/reload created a new identity, causing dual cards and repeated admit. DR-31 participantId plus reconnect token is in-memory and 2-minute TTL, so it does not survive full reloads or long drops.

## Root Cause
Participant identity was tied to transient socket/reconnect state. Once the reconnect ticket or reconnecting entry expired, the server had no durable browser-scoped key to map a returning caller back to the same participantId during the same meeting.

## Files Changed
- `frontend/src/app/pages/room/room.page.ts`: added `readClientKey()` and sends `clientKey` on every join. The key is generated once with `crypto.randomUUID()` when available and stored in `localStorage` as `meet-poc.clientKey`.
- `frontend/src/app/services/ws.service.ts`: extended the outgoing join message type with `clientKey`.
- `backend/src/modules/signaling/index.ts`: added sanitized `clientKey` handling and a room/meeting-scoped `clientIdentities` map of `clientKey -> { participantId, name, wasAdmitted }`. Active/reconnecting clientKey matches use the existing DR-31 `peer-resumed` path; durable map matches after grace expiry reuse participantId while preserving normal admit policy.
- `backend/tests/signaling-reconnect.test.ts`: added backend coverage for clientKey resume, durable identity after grace expiry, and unknown clientKey new identity.
- `e2e/tests/v3-identity/identity.spec.ts`: added browser reload/rejoin coverage proving localStorage clientKey persistence and single same-participant card after re-admit.

## Out of Scope
- DR-39 whole-meeting auto-admit policy was not implemented.
- DR-38 leave-vs-drop card behavior was not changed.
- Stability/video behavior was not changed.

## Cookie Decision
No cookie was added. DR-37 only needs the WebSocket join path, and localStorage is enough to carry the opaque browser key. Cookie mirroring can be revisited only if DR-39 needs an HTTP admit path signal.

## Autonomous Decisions
None.
