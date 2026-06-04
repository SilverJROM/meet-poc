# FIX2 Changes — Mid-call subscribe retry

## User Report
Peer turns their mic on mid-call and another participant may never hear them.

## Root Cause
`subscribeNewRemoteTracks()` called `enqueue(() => doSubscribeTracks(...))` without a catch, retry, watchdog, or version bump. A transient CF `not_found_track_error`, SDP timeout, or reconcile failure rolled back and rethrew into a dropped promise. Later presence had already recorded the new track in `prev.tracks`, so `selectNewRemoteTracks()` returned empty and the subscriber never retried.

The join-path retry did not cover this path because `subscribeRetryVersion` re-enters `subscribeIfNeeded()`, which short-circuits on `subscribedClientIds.has(clientId)`. The first-frame watchdog is also camera-frame poisoned for this case.

## Design
- Added separate `midCallSubscribeRetryAttempts` and `midCallSubscribeRetryTimers`.
- Keyed retries per publisher `clientId`, publisher `cfSessionId`, and `trackName`.
- Reused `planSubscribeRetry()` with `hasFirstFrame:false`, `SUBSCRIBE_RETRY_CAP`, and the existing backoff constants.
- On retry tick, re-read live `remotePublishers()` and derive missing tracks from advertised tracks filtered against actual subscribed state in `midToEntry` plus `subscribedTracks`.
- Stop if publisher/session changed, the track is no longer advertised, or actual subscribed state already contains the track.
- Retry calls `doSubscribeTracks()` directly; it does not use `subscribeRetryVersion` or `subscribeIfNeeded()`.
- Cap exhaustion logs and stops without leaving a timer.
- First-try success schedules no retry timer and does not enqueue extra work.

## Per-file WHY
- `frontend/src/app/services/sfu-client.service.ts`: Adds the bounded mid-call retry controller around the existing partial-subscribe path and clears its timers/counters in existing teardown/eviction paths.
- `frontend/src/app/services/sfu-client.spec.ts`: Adds deterministic fake-timer coverage for transient retry success, cap stop, success no-churn, removed-track stop, cfSession-change stop, already-subscribed no double subscribe, and teardown cleanup.

## No-regression statement
- Join-path `subscribeIfNeeded()` retry behavior was not changed.
- `doSubscribeTracks()` transactional rollback internals were not changed.
- Reconcile logic was not changed.
- Transport recovery state machine was not changed.
- A successful mid-call subscribe still performs one serialized `doSubscribeTracks()` call and creates no retry timer.

## Honest device-seat note
The real mid-call unmute under transient CF/network failure is JROM's device seat. Unit tests prove the retry mechanism and stop conditions deterministically.
