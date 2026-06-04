# B19 Changes

## User Report Verbatim
"Universal + Zoom/Meet = 3-5 people can all reliably hear/see each other, and a partial subscribe failure must NOT corrupt the client into a permanent half-subscribed state."

## Root Cause Mechanism

### SFU-S1
`doSubscribeTracks()` populated shared `midToEntry` immediately after `setRemoteDescription()` so early `ontrack` could route correctly, but it only committed `subscribedTracks` after `createAnswer`, `setLocalDescription`, and the network `PUT /api/sfu/renegotiate`. If that PUT failed, `midToEntry` contained this attempt's mids while `subscribedTracks` did not, so the retry path could collide with stale routing entries.

### SFU-S2
Presence reset some retry state when a known `clientId` returned with a new `cfSessionId`, but stale per-client subscribed mids were left in `midToEntry` and `subscribedTracks`. Roster snapshot handling did not evict stale state either.

### SFU-S3
`reconcileSubscribedMids()` only checked total count and receiver kind at the global positional index. That could fail to detect deterministic count/kind drift when totals matched but per-kind counts diverged. Track names also were not uniqueness-checked.

### SFU-S4
`doPublishScreen()` added a transceiver and local offer before calling CF `/api/sfu/tracks`, but failures left the added sender/transceiver and local offer state uncleared.

## Per-File WHY

### `frontend/src/app/services/sfu-client.service.ts`
- Added transactional rollback inside `doSubscribeTracks()`.
- Snapshot `subscribedTracks`, touched `midToEntry` prior values, and publisher retry metadata.
- Preserve early `midToEntry` population before answer creation for `ontrack` routing.
- On failure, restore exact touched mid entries, restore `subscribedTracks`, restore retry metadata, attempt `rollbackPendingLocalOffer()`, and rethrow.
- Reused `clearPublisherSubscriptionStateForRetry()` in presence and roster when the same `clientId` gets a new `cfSessionId`.
- Added best-effort `rollbackAddedScreenTransceiver()` and wrapped `doPublishScreen()` so failed screen publish rolls back local offer and clears the added screen sender/transceiver.

### `frontend/src/app/services/sfu-mid-reconcile.ts`
- Enforced response `trackName` uniqueness.
- Enforced known track kinds.
- Enforced per-receiver-kind count parity between response tracks and new transceiver mids.
- Changed matching to positional within each receiver kind.
- Documented the residual same-kind limitation honestly.

### `frontend/src/app/services/sfu-client.spec.ts`
- Added deterministic SFU-S1 failure and success tests.
- Added SFU-S2 presence and roster stale-eviction tests.
- Added SFU-S4 screen-publish rollback test.
- Extended reconcile coverage for positional-within-kind mapping, per-kind drift, and duplicate `trackName`.
- TS2 note: the spec already used the current 5-argument `reconcileSubscribedMids()` signature in this checkout, so this batch verified and extended coverage rather than manufacturing a signature fix.

## Honest Multi-Party Note
This batch proves the SFU state-machine invariants with deterministic unit tests and a green frontend build. It does not prove real 3-5 party Cloudflare SFU behavior on live devices. Real multi-device all-hear-all validation remains JROM's seat and projcore's independent validation path.

## Autonomous Decisions
- Added a decision note: `decisions/2026-06-04-b19-sfu-subscribe-rollback-reconcile.md`.
