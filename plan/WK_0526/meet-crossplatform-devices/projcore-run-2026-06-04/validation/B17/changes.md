# B17 Changes

## User Report
Verbatim batch brief: "B17 (resource leaks LEAK2 recorder orphaned source on reconnect, LEAK3 active-speaker per-peer analyser duplication, LEAK4 sfu-client untracked subscribe backoff timers, LEAK5 media.service registerDebugTracks strong refs)."

## Root Cause Mechanism

LEAK2: `RecorderService.addStream()` returned early when `sourceFor` already had the `clientId`. A reconnect/replacement stream for the same peer could not replace the existing graph entry, leaving the old source connected until broader cleanup.

LEAK3: `ActiveSpeakerService.add()` did not enforce its own one-entry-per-peer invariant. Normal `observe()` removed on stream changes, but direct/repeated add paths could create replacement work without the add method disconnecting the prior graph first.

LEAK4: `SfuClientService` tracked subscribe stuck watchdog timers, but the retry backoff timers scheduled after subscribe failure/stuck retry were plain `setTimeout()` calls. Cleanup paths cleared watchdogs but not those retry backoffs.

LEAK5: `registerDebugTracks()` appended tracks into `window.__activeTracks` with strong references and no pruning. Ended tracks could stay pinned for the life of the page across repeated acquisition/switch cycles.

## Per-file WHY

- `frontend/src/app/services/recorder.service.ts`: re-add now disconnects/removes an existing source for the same `clientId` before adding the replacement, and keeps `sourceCount` tied to `sourceFor.size`.
- `frontend/src/app/services/active-speaker.service.ts`: `add()` now removes/disconnects an existing analyser graph for the peer before creating the replacement. Detection thresholds, sampling loop, and active-speaker semantics are unchanged.
- `frontend/src/app/services/sfu-client.service.ts`: added a tracked `subscribeBackoffTimers` set plus schedule/clear helpers. The two existing subscribe retry backoffs use the helper, and every teardown path that already clears subscribe stuck watchdogs now also clears subscribe backoffs. `planSubscribeRetry` and transport recovery logic were not changed.
- `frontend/src/app/services/media.service.ts`: `registerDebugTracks()` now prunes ended/duplicate tracks, registers a deterministic ended-track prune listener, and caps the debug registry at 64 entries. No live media lifecycle logic changed.
- `frontend/src/app/services/recorder-leaks.spec.ts`: proves recorder replacement disconnects the prior source and keeps count stable.
- `frontend/src/app/services/active-speaker-leaks.spec.ts`: proves analyser replacement/removal disconnects graph nodes and keeps one entry per peer.
- `frontend/src/app/services/sfu-client.spec.ts`: proves tracked subscribe backoff timers are cleared in teardown and cannot bump retry version after cleanup.
- `frontend/src/app/services/media-screen.spec.ts`: proves ended debug tracks are pruned and not retained on later registration.

## Honest Proof Note

The leak fixes are proven by deterministic unit assertions over graph disconnects, timer clearing, and debug registry pruning, plus targeted regression specs and `npx ng build`. Long-session real memory/CPU profiling and real-device endurance behavior are not claimed here; that remains JROM/projcore validation territory.

## Autonomous Decisions

See `decisions/2026-06-04-b17-resource-leak-strategies.md`.

