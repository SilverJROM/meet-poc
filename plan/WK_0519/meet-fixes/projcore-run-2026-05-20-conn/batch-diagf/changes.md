# DIAGF Changes

## Root Cause

The server treated any WebSocket close as a real departure, immediately removed the admitted peer, and broadcast `peer-left`. A reconnect then joined as a new `clientId`, which forced guests back through admission and left other clients with stale failed/disconnected peer state. The earlier DR-3 reconnect token also lived only on the active client path and did not preserve the old admitted slot for reconciliation.

## Backend

- Added admitted-peer reconnect grace records keyed by old `clientId`.
- Transient socket close now broadcasts `peer-reconnecting` and keeps the admitted slot resumable for the short grace window.
- Successful resume broadcasts `peer-resumed` with `{ oldClientId, clientId, name, host }` so clients can reconcile identity.
- Guest resume requires a valid unexpired reconnect token scoped to room, session, user, and old client id.
- Owner resume is unconditional by ownership only when authenticated owner email matches the grace record.
- Explicit `leave`, host `remove-peer`, and meeting end still remove immediately and broadcast removal.
- Empty-room cleanup now accounts for reconnecting peers so a transient drop does not close the live room too early.

## Frontend

- Persisted reconnect token in session storage by room route key so browser socket drops can resume.
- Added handling for `peer-reconnecting` and `peer-resumed`.
- Reconciled old peer ids to new ids while preserving the old remote stream to avoid ghost tiles and visible duplicate peers.
- Added 20-second ICE recovering timers in `WebrtcService`; audio/stream remains attached during the grace period.
- Made explicit user leave send a `leave` message before closing the socket, preserving the explicit-leave semantics distinct from transient drops.

## Tests

- Added DIAGF e2e coverage for guest resume without readmit, owner auto-resume, no ghost tile, explicit leave removal, and ICE recovering state.
- Updated backend reconnect tests to exercise transient raw drops separately from explicit leave.
- Updated legacy peer-left/host-action tests honestly: explicit leave/remove still asserts immediate `peer-left`; transient drop now asserts reconnect grace.
- Updated transcript peer-leave e2e to use explicit Leave instead of treating browser context close as a hard departure.
