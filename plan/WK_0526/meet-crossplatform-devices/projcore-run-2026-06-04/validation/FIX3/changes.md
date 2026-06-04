# FIX3 Changes — Idempotent doSubscribeTracks

## User Report
R3 confirmed FIX2 closed the mid-call subscribe blocker but exposed a regression: a participant who joins with mic and camera both off, then unmutes, is double-subscribed by existing peers and produces doubled/echoed audio.

## Root Cause
FIX2 broadened the mid-call subscription branch from screen-only to all newly advertised tracks. For a default-muted join, the publisher initially has `tracks: []`, so `subscribeIfNeeded()` never adds the publisher to `subscribedClientIds`.

On first unmute, `handleSfuPresence()` updates `remotePublishers` and calls the FIX2 mid-call subscribe path. The room-page subscribe effect also reacts to the same `remotePublishers` update and calls `subscribeIfNeeded()`, whose client-level guard still allows the publisher because the mid-call path does not set `subscribedClientIds`.

Both paths serialize through `opQueue`, but `doSubscribeTracks()` did not dedupe by actual subscribed track state. The second op could POST the same track again, creating a second receive transceiver and a distinct remote audio track instance.

## Design
- Added a `tracksToSubscribe` filter at the top of `doSubscribeTracks()`.
- The filter uses existing `isTrackSubscribed(publisher.clientId, track.trackName)`.
- The early return for an empty filtered list happens before:
  - `subscribeInitiatedAt` stamp
  - `cfSessionId` downstream setup
  - `kindMap`
  - `existingMids`
  - `/api/sfu/tracks` POST
  - rollback/reconcile snapshots and mutations
- `kindMap` and the `/api/sfu/tracks` request body now use `tracksToSubscribe`.
- Reconcile continues to operate from the CF response for the filtered request, with `kindMap` built only from the filtered tracks.

## Per-file WHY
- `frontend/src/app/services/sfu-client.service.ts`: Makes the single subscribe chokepoint idempotent so any serialized duplicate subscribe for an already-committed track becomes a mutation-free no-op.
- `frontend/src/app/services/sfu-client.spec.ts`: Adds deterministic coverage for the no-op case, double-trigger same-track case, mixed existing/missing filtered request, and real FIX2 mid-call retry success for a truly missing track.

## No-regression statement
- FIX2 mid-call retry was not changed.
- Join-path `subscribeIfNeeded()` and `doSubscribe()` were not changed.
- `handleSfuPresence()` and roster/presence branching were not changed.
- Transactional rollback and reconcile logic were not changed.
- Transport recovery was not changed.
- A genuinely missing join or mid-call track still passes the filter and subscribes through the existing path.

## Honest device-seat note
Unit tests prove the idempotency and retry mechanics. Real join-muted-to-unmute no-echo confirmation remains JROM's device seat.
