# IMPL-1 Changes — Per-Publisher Remote Audio Registry

## What Changed
- Replaced the audible remote-audio mixer path with a `RemoteAudioService` registry keyed by publisher client id.
- Each remote publisher now gets exactly one hidden `<audio data-remote-audio playsinline>` element created by the service, with no `autoplay` attribute.
- `addPublisher()` applies `srcObject`, volume, mute-all, and `setSinkId()` before the service-owned `play()` call.
- Added explicit sticky `unlocked` state: `unlockAndPlayRemoteSinks()` sets it on real gesture unlock, and late publishers are immediately played by `addPublisher()`.
- Registry diff is driven from `syncPeers(this.peers())`, including replacement when stream identity or current live audio-track identity changes.
- `remoteAudioBlocked` is now registry-backed: non-empty registry plus any paused/blocked element.
- Removed tile-owned audible remote audio elements and the room mixer element, preventing duplicate audio in share/grid/strip layouts.
- Speaker volume is capped at native media-element max `1.0`; stored mixer-era values above `1.0` are migrated to `1.0`.

## Why
The host-hears-nothing failure was consistent with the single Web-Audio mixer output path routing to a selected non-default sink incorrectly or losing the graph. Direct per-publisher media elements avoid the Web-Audio destination stream as the audible path and apply sink routing to each WebRTC `MediaStream` element before playback.

## Files
- `frontend/src/app/services/remote-audio.service.ts`
  - Added registry add/remove/clear/replay logic, sink-before-play ordering, sink timeout fallback, sticky unlock, per-element volume/mute, and registry diagnostics/debug state.
- `frontend/src/app/pages/room/room.page.ts`
  - Rewired peer sync, banner state, speaker routing, interaction recovery, visibility/pageshow recovery, and keepalive recovery to the registry.
- `frontend/src/app/pages/room/room.page.html`
  - Removed the mixer `<audio>` element.
- `frontend/src/app/components/tile/tile.component.ts`
  - Removed tile-owned remote audio playback effect.
- `frontend/src/app/components/tile/tile.component.html`
  - Removed tile-owned `<audio data-remote-audio autoplay>`.
- `frontend/src/app/components/controls-bar/controls-bar.component.ts`
  - Removed amp labeling above 100%.
- `frontend/src/app/components/controls-bar/controls-bar.component.html`
  - Changed speaker volume slider max from `1.3` to `1`.
- `frontend/src/app/services/remote-audio.service.spec.ts`
  - Added registry coverage while preserving sink fallback/coalescing coverage.
- `frontend/src/app/services/feedback-limiter.spec.ts`
  - Removed obsolete Web-Audio limiter spec because the accepted Option A audible path has no Web-Audio limiter.

## Specs Added / Updated
- `remote-audio.service.spec.ts` asserts:
  - `setSinkId()` is called before `play()`.
  - registry elements have no autoplay attribute.
  - element `volume`/`muted` mirror service `volume()`/`mutedAll()`, including mute-all volume `0`.
  - `reset()` clears registry elements by pausing, nulling `srcObject`, and removing them.
  - a late publisher added after sticky unlock auto-plays.
  - `remoteAudioBlocked` becomes true when a registry element is paused and clears after replay.
  - re-adding the same publisher leaves exactly one connected element.
  - stored `1.3` volume migrates to `1.0`.
  - selected sink fallback and latest-sink coalescing still work.

## Commands / Results
- `cd frontend && npx tsx src/app/services/remote-audio-watchdog.spec.ts && npx tsx src/app/services/remote-audio-health.spec.ts && npx tsx src/app/services/remote-audio-playability.spec.ts && npx tsx src/app/services/remote-audio.service.spec.ts`
  - PASS: all assertions passed.
  - Expected debug log appears in `remote-audio.service.spec.ts` for the fallback test: selected sink rejection falls back to default.
- `cd frontend && npx tsc --noEmit`
  - PASS: exit 0.
- `cd frontend && npx ng build`
  - PASS: application bundle generated.
  - Existing warnings: Stencil empty glob, MediaPipe CommonJS optimization bailout.

## Caveats
- Recorder code and recorder AudioContext were not changed.
- The old feedback limiter was intentionally removed from the audible path per Option A/B2 acceptance; native element volume is capped at 100%.
- IMPL-2 SFU mid-overwrite guard and IMPL-3 diagnostics payload are intentionally out of scope.
- No git commit was made.

# CR-FIX-2 Changes — Red-Team CR2 Findings

## What Changed
- Made the remote voice-stall latch non-sticky by clearing `voiceStalled` on muted-all, no-sample, bytes-flat/reset, peer-gone, emitted-advanced, and explicit service clear paths.
- Added a windowed real-audio gate for voice recovery using `audioLevel` and `totalAudioEnergy`; silent RTP/CN bytes with flat emitted count now resets/clears instead of showing the unblock banner.
- Changed failed subscribe rollback to restore only touched mids and the failing publisher's stream/track-name state, preserving unrelated post-snapshot `ontrack` streams.
- Carried subscribed SFU `trackName` from `SfuClientService.processOntrack()` through remote-audio playout diagnostics and joined diagnostics energy by publisher plus `trackName`.
- Removed the redundant `clearSources()` call/path after `clearRegistry()`.

## Files
- `frontend/src/app/pages/room/room.page.ts` — Clears stale voice-stall state on every watchdog abandonment/reset path and passes SFU track-name metadata into remote audio sync.
- `frontend/src/app/services/remote-audio.service.ts` — Adds windowed energy detection, explicit voice-stall clearing, `trackName` diagnostics, muted-all clearing, and removes dead `clearSources()`.
- `frontend/src/app/services/sfu-client.service.ts` — Tracks browser track id -> SFU trackName metadata and scopes subscribe rollback to touched mids/publisher streams.
- `frontend/src/app/services/meeting-sessions.service.ts` — Adds `trackName` to `RemoteAudioPlayoutDiagnostics.perPublisher`.
- `frontend/src/app/pages/diagnostics/diagnostics.page.ts` — Joins per-publisher inbound energy by SFU `trackName` instead of browser `trackId`.
- `frontend/src/app/services/remote-audio-watchdog.spec.ts` — Covers silent bytes-up/emitted-flat suppression through the energy window.
- `frontend/src/app/services/remote-audio.service.spec.ts` — Covers explicit clear of the latch and `trackName` playout diagnostics.
- `frontend/src/app/services/sfu-client.spec.ts` — Covers failed subscribe rollback preserving an unrelated concurrent `ontrack` stream and its track-name metadata.
- `frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts` — Covers energy join using SFU `trackName` when browser `trackId` differs.

## Commands / Results
- `npx tsx frontend/src/app/services/remote-audio-watchdog.spec.ts` — PASS.
- `npx tsx frontend/src/app/services/remote-audio.service.spec.ts` — PASS.
- `npx tsx frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts` — PASS.
- `npx tsx frontend/src/app/services/sfu-client.spec.ts` — PASS.
- `npx tsc --noEmit -p frontend/tsconfig.json` — PASS, exit 0.
- `npm run build -w frontend` — PASS. Existing warnings: Stencil empty glob and MediaPipe CommonJS optimization bailout.

## Caveats
- No recorder files were touched.
- No git commit was made.

# CR-FIX-10 Changes — CR12 Coverage Gaps

## What Changed
- Added a pure, behavior-preserving remote voice watchdog decision helper and wired `room.page.ts` to execute its returned side-effect action.
- Added revert-failing tests for watchdog recover, emission-advanced clear, bytes-flat clear, no-sample clear, muted-all clear, no-energy clear, exhausted-window stall latch, and negative-stat rejection.
- Added explicit remote-audio service tests proving latched `voiceStalled` clears through bytes-flat/no-energy clear calls and muted-all.
- Added backend store-path coverage proving `appendDiagnosticsEntry()` writes `payload_json` without `clientKey` while preserving the private attribution column.

## Files
- `frontend/src/app/pages/room/room-decisions.ts` — Extracted the remote voice watchdog branch decision into `decideRemoteVoiceWatchdogAction()`.
- `frontend/src/app/pages/room/room.page.ts` — Delegates watchdog branch selection to the pure helper while keeping the existing runtime service calls in the component.
- `frontend/src/app/pages/room/room-decisions.spec.ts` — Covers all CR12 watchdog glue decisions.
- `frontend/src/app/services/remote-audio.service.spec.ts` — Covers independent voice-stall clear subcases after a latched stall.
- `backend/tests/session-diagnostics.test.ts` — Covers direct SQLite stored payload redaction after `appendDiagnosticsEntry()`.

## Commands / Results
- `npx tsx frontend/src/app/pages/room/room-decisions.spec.ts` — PASS.
- `npx tsx frontend/src/app/services/remote-audio.service.spec.ts` — PASS.
- `npx tsx frontend/src/app/services/remote-audio-watchdog.spec.ts` — PASS.
- `npm test -w backend -- session-diagnostics` — PASS, 15 tests.
- `cd frontend && npx tsc --noEmit` — PASS, exit 0.

## Caveats
- No production behavior change was intended; the extraction is a pure testability refactor for the existing watchdog decision tree.
- No git commit was made.

# CR-FIX-4 Changes — CR5 Browser-Quirk + Garbage-Input Hardening

## What Changed
- Added a distinct `SinkApplyResult` value, `unsupported`, for browsers without `setSinkId()` when a non-default output is selected. Playout diagnostics now honestly report `effectiveSinkId: ''` and `usedFallback: true`, while room speaker banners do not treat unsupported routing as a hard selected-speaker error.
- Treated all-ended remote streams as having no current audio track. `currentAudioTrack()` now returns `null` for all-ended streams, `addPublisher()` refuses ended tracks, and `syncPeers()` removes any existing registry entry instead of leaving a silent orphan.
- Rejected negative RTC voice-watchdog counters and ignored negative `audioLevel` / `totalAudioEnergy`, so garbage finite stats cannot trigger a false voice-stall recovery.
- Reconciled stale selected audio-output ids during device refresh by validating nonblank selected output ids against current `enumerateDevices()` output ids, falling back and clearing storage when the selected id disappears.
- Split autoplay rejection classes: `NotAllowedError` remains in the tap-to-enable blocked lane, while `NotSupportedError` and `AbortError` are bounded out of the gesture replay/banner path.

## Files
- `frontend/src/app/services/remote-audio.service.ts` — Sink result semantics, diagnostics fallback state, ended-track guard, negative stat filtering, and autoplay error-class split.
- `frontend/src/app/pages/room/room.page.ts` — Stale selected output reconciliation, unsupported sink result handling, and negative inbound stat sanitation before watchdog sampling.
- `frontend/src/app/pages/room/room-decisions.ts` — Pure selected-output reconciliation predicate.
- `frontend/src/app/services/remote-audio.service.spec.ts` — Regression coverage for unsupported sink diagnostics, ended-only stream removal, and NotSupported autoplay behavior.
- `frontend/src/app/services/remote-audio-watchdog.spec.ts` — Regression coverage for negative counters and negative energy/level input.
- `frontend/src/app/pages/room/room-decisions.spec.ts` — Regression coverage for stale selected speaker reconciliation.

## Commands / Results
- `cd frontend && npx tsx src/app/services/remote-audio.service.spec.ts` — PASS.
- `cd frontend && npx tsx src/app/services/remote-audio-watchdog.spec.ts` — PASS.
- `cd frontend && npx tsx src/app/pages/room/room-decisions.spec.ts` — PASS.
- `cd frontend && npx tsc --noEmit` — PASS, exit 0.
- `cd frontend && npx ng build` — PASS. Existing warnings: Stencil empty glob and MediaPipe CommonJS optimization bailout.

## Caveats
- No recorder files were touched.
- No git commit was made.
