# codex55 CODE red-team CR1

## Bugs found

| severity | file:line | what breaks | fix |
|---|---|---|---|
| P0 | frontend/src/app/pages/room/room.page.ts:2721, frontend/src/app/pages/room/room.page.ts:2766, frontend/src/app/pages/room/room.page.ts:2779, frontend/src/app/services/remote-audio.service.ts:292, frontend/src/app/services/remote-audio.service.ts:493, frontend/src/app/services/remote-audio.service.ts:496, frontend/src/app/services/remote-audio.service.ts:527 | Silent decoded-but-not-emitted playout still has no banner path. The remote voice watchdog can detect bytes climbing while `jitterBufferEmittedCount` is flat and call `recoverVoicePlayout()`, but that remediation only re-applies sink and calls `el.play()`. If `play()` resolves and the element remains unpaused, `entry.blocked` is set false and `remoteAudioBlocked` remains false. This is exactly the dangerous state for JROM's live failure: inbound audio is arriving/decoding, the native element reports "playing", but the sink emits no sound and the user never sees "Enable audio". | Add a registry/room state for "remote voice sink stalled" driven by the watchdog's bytes-climb/emitted-flat verdict. Keep the banner true until playout emission advances or a successful user-gesture recovery proves emission resumed. Do not define blocked solely as `entry.blocked || entry.el.paused`; include watchdog sink-stall evidence by publisher id. |

## Regressions from the mixer removal

No broken build or direct dangling mixer graph call found. `npm run build -w frontend` passes.

The remaining mixer-era leftovers are not compile breakers but are dead/obsolete surfaces:
- `RoomPage.remoteAudioMixerEnabled` is hard-coded false and still passed to tiles at frontend/src/app/pages/room/room.page.html:250, frontend/src/app/pages/room/room.page.html:270, frontend/src/app/pages/room/room.page.html:290.
- `TileComponent.remoteAudioEnabled` and `remoteAudioBlocked` remain declared at frontend/src/app/components/tile/tile.component.ts:23 and frontend/src/app/components/tile/tile.component.ts:26, but the tile template no longer owns audio and never emits blocked.
- `RoomPage.remoteAudioMixer` viewChild / debug naming remains at frontend/src/app/pages/room/room.page.ts:510 and frontend/src/app/pages/room/room.page.ts:595. This is confusing but not the ship-blocking bug.

Volume, mute-all, selected output routing, registry sync, cleanup, keepalive, pageshow/visibility recovery, diagnostics payload population, and controls-bar volume cap all appear wired to the registry.

## Silent-no-banner paths in the CODE

P0 path:
1. A remote audio inbound track reports `bytesReceived` increasing and `jitterBufferEmittedCount` not increasing.
2. `pollRemoteVoiceWatchdog()` collects those stats at frontend/src/app/pages/room/room.page.ts:2721 and `observeRemoteVoiceTrack()` chooses a recovery action at frontend/src/app/pages/room/room.page.ts:2766.
3. `recoverVoicePlayout()` at frontend/src/app/services/remote-audio.service.ts:282 only calls `replayRegistryElements()`.
4. `replayRegistryElements()` at frontend/src/app/services/remote-audio.service.ts:493 treats a resolved `entry.el.play()` as success and sets `entry.blocked = false` at frontend/src/app/services/remote-audio.service.ts:496.
5. `refreshBlockedState()` at frontend/src/app/services/remote-audio.service.ts:527 only considers `entry.blocked || entry.el.paused`, so if the HTMLAudioElement is unpaused the banner stays false.

That leaves a live publisher inaudible with no unblock banner when the browser reports playback success but media playout is stalled.

## Test adequacy gaps

Tests are not adequate for the failure this change is supposed to prevent.

The added `remote-audio.service.spec.ts` cases assert sink-before-play, volume/mute, reset, late joiner play, paused-element banner, and dedup at frontend/src/app/services/remote-audio.service.spec.ts:243 through frontend/src/app/services/remote-audio.service.spec.ts:341. They do not assert bytes-climbing/emitted-flat remote voice stalls, banner visibility from watchdog evidence, or that repeated voice recovery keeps the banner up when `play()` resolves but output emission does not recover.

The `sfu-client.spec.ts` media-playout coverage at frontend/src/app/services/sfu-client.spec.ts:1174 only asserts capture/optional absence. It does not tie `mediaPlayout.totalSamplesDuration` / `jitterBufferEmittedCount` to the room banner or remote audio blocked state.

The diagnostics rows are useful for after-the-fact analysis, but `buildRemoteAudioPlayoutRows()` repeats one global `mediaPlayout` value for every publisher at frontend/src/app/pages/diagnostics/diagnostics.page.ts:100. That is acceptable for global sink proof, but it does not prove per-publisher audibility.

STATUS: BUGS - decoded remote audio can remain inaudible with `remoteAudioBlocked=false` because watchdog sink-stall evidence is never fed into the banner state.
