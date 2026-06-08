# codex55 CODE red-team CR4

## Concurrency/race findings

### BUG-1: selected-speaker failure races are misreported as success after default fallback

`applyMediaElementSinkWithDefaultFallback()` catches `setSinkId(selected)` failure, clears stored output, tries `setSinkId('')`, and returns `true` when the default fallback succeeds (`frontend/src/app/services/remote-audio.service.ts:123-140`). That return value is consumed as "the requested device was applied" by both `RemoteAudioService.applyOutputDevice()` (`frontend/src/app/services/remote-audio.service.ts:272-276`) and `RoomPage.changeAudioOutputDevice()` (`frontend/src/app/pages/room/room.page.ts:1009-1021`).

Real interleaving:

1. Host is in-call on non-default sink `speaker-ext`.
2. `applySpeakerDevice('speaker-ext')` or a new publisher's `addPublisher()` calls `setSinkId('speaker-ext')`.
3. Device is unplugged, stale, or transiently unavailable; `setSinkId('speaker-ext')` rejects.
4. Helper falls back to `setSinkId('')` and returns `true`.
5. Room keeps/sets `selectedAudioOutputId = 'speaker-ext'` and does not set `"Selected speaker is unavailable..."` because `applied === true` (`room.page.ts:1011-1021`, `room.page.ts:669-675`).
6. Diagnostics can show `selectedAudioOutputId` as the unavailable selected device while element `sinkId` is default (`room.page.ts:3497`, `remote-audio.service.ts:357-375`), and the user is not told that remote audio is no longer routed to the chosen sink.

This is a real selected-output correctness bug, not just a diagnostic quirk. If the host's audible device is the selected headset/speaker and default output is silent, unplugged, muted, or not where the host is listening, the code reports success while the host cannot hear remote talkers on the selected sink.

### addPublisher/syncPeers race audit

I did not find a double-element, orphan-element, or lost-track race in the current per-publisher registry path:

- `syncPeers()` removes departed publishers before adding/replacing and compares both `stream` and concrete `track` identity, so same-stream audio-track replacement is not skipped (`frontend/src/app/services/remote-audio.service.ts:239-262`).
- `addPublisher()` stores a generation, removes the prior id, appends one hidden element, then checks `isEntryCurrent()` after both async `setSinkId` and `play()` awaits (`remote-audio.service.ts:403-468`, `remote-audio.service.ts:520-522`).
- `reset()` and `setInCallActive(false)` bump generation and clear registry (`remote-audio.service.ts:380-390`), so stale async completions destroy their own entry instead of reviving it (`remote-audio.service.ts:447-456`, `remote-audio.service.ts:460-462`).
- `removePublisher()`/`clearRegistry()` destroy the element and listeners synchronously (`remote-audio.service.ts:470-538`).

One nuance: if `withTimeout(this.applySinkId(...), 2000)` times out, the underlying `setSinkId` promise can still finish later (`remote-audio.service.ts:440-442`). That can temporarily play through current/default output before a slow sink application settles. I am not marking that as a new bug because it is explicit timeout behavior, but it makes BUG-1 more important: selected-sink failures must be observable as selected failures, not successful routing.

## Leak findings

### BUG-2: `subscribeMidConflictWarnings` is unbounded and never cleared

`subscribeMidConflictWarnings` is a service-lifetime `Set` (`frontend/src/app/services/sfu-client.service.ts:100`) and only ever receives new keys on live mid conflicts (`sfu-client.service.ts:1743-1747`). I found no deletion/clear in peer leave, cfSession change, transport reset, reconnect reset, exit teardown, or destroy:

- peer leave clears subscription/retry state but not warning keys (`sfu-client.service.ts:1013-1054`);
- publisher cfSession change clears retry/subscription state but not warning keys (`sfu-client.service.ts:972-1004`);
- local transport reset/exit/destroy clear many maps and timers but not this set (`sfu-client.service.ts:423-443`, `sfu-client.service.ts:1472-1498`, `sfu-client.service.ts:1515-1538`).

The key includes `mid`, existing publisher id/trackName, and incoming publisher id/trackName (`sfu-client.service.ts:1744`). Track names include per-publish UUIDs (`sfu-client.service.ts:1602`), so a long churny call that repeatedly hits transient mid conflicts can accumulate unique strings without a bound. This is not likely to cause immediate JROM audio loss, but it fails the long-call/churn leak surface.

### Other leak surfaces checked

- Per-publisher DOM elements are removed on explicit remove, registry clear, and stale async completion (`remote-audio.service.ts:470-538`).
- Element listeners (`playing`, `play`, `pause`, `ended`, `error`) and track `ended` listener are removed in `destroyRegistryElement()` (`remote-audio.service.ts:524-530`).
- `remoteVoiceWatchdogPeers` is cleared on stop/muted-all and pruned for inactive inbound publishers (`room.page.ts:2693-2698`, `room.page.ts:2708-2711`, `room.page.ts:2721-2725`).
- `micSilenceWindow` is bounded and cleared on watchdog stop/inactive mic (`room.page.ts:3289-3292`, `room.page.ts:3306-3311`, `room.page.ts:3325-3329`).
- Mid-call subscribe retry maps/timers are cleared by peer/session and globally on reset/destroy (`sfu-client.service.ts:252-270`, `sfu-client.service.ts:1085-1089`, `sfu-client.service.ts:1484-1486`).

## JROM-scenario trace: any failing step?

If the selected non-default sink remains valid for the whole call, the current code should make the host hear both talkers:

1. Host selects non-default output. `changeAudioOutputDevice()` calls `applySpeakerDevice()`, which applies sink routing to non-remote media plus `remoteAudio.applyOutputDevice()` for current registry entries (`room.page.ts:1009-1021`, `room.page.ts:2622-2633`).
2. Publisher A joins and talks. SFU `ontrack` creates/updates remote streams (`sfu-client.service.ts:825-850`); Room effect feeds peers plus `remoteTrackNames` into `remoteAudio.syncPeers()` (`room.page.ts:630-632`); `addPublisher()` creates one audio element, sets `srcObject`, applies volume, awaits selected sink, then plays (`remote-audio.service.ts:403-468`).
3. Publisher B joins and talks. Registry is keyed by publisher id, so B gets its own concurrent `<audio data-remote-audio="B">` and does not replace A (`remote-audio.service.ts:200`, `remote-audio.service.ts:435-437`).
4. A mutes/unmutes. The remote element remains attached to A's stream; playout does not depend on trackName changing. Silence/voice recovery is based on inbound stats and clears when emitted samples advance (`room.page.ts:2738-2783`, `remote-audio.service.ts:292-301`).
5. B leaves+rejoins. Peer removal tears down B's remote stream/subscription state (`sfu-client.service.ts:1007-1054`), Room peer sync removes B's registry element (`remote-audio.service.ts:250-252`), and the new B cfSession can subscribe/rebuild a fresh element.

Failing step under real-world churn: if the selected output is invalid at selection time, goes invalid during apply, or is unplugged mid-call, the code can route both A and B to default while preserving/reporting the selected device as successful. That is BUG-1.

## Device hot-swap mid-call

BUG-1 is the hot-swap failure. On `devicechange`, the code refreshes devices and only reconciles the selected microphone (`frontend/src/app/pages/room/room.page.ts:2609-2617`). `refreshDevices()` may change `selectedAudioOutputId` when the old output is absent (`room.page.ts:2342-2344`, `room.page.ts:3861-3868`), but the output-routing effect explicitly returns when the selected output id is falsy (`room.page.ts:665-668`). There is no explicit `applySpeakerDevice('')` or banner/error path for output-device removal.

Expected behavior for unplug: selected sink fails, app routes all media to default, clears selected output state, and tells the host "using system default." Current behavior is inconsistent:

- a `setSinkId(selected)` failure can return `true` after default fallback, preventing the banner and preserving stale selected state (`remote-audio.service.ts:123-140`, `room.page.ts:1011-1021`);
- when refresh clears the selected output to default, the effect does not call `applySpeakerDevice('')` because `!deviceId` returns early (`room.page.ts:665-668`);
- `remoteAudio.playoutDiagnostics().selectedAudioOutputId` can remain the service's stale `selectedSinkId` until `remoteAudio.applyOutputDevice('')` is called (`remote-audio.service.ts:272-276`, `remote-audio.service.ts:357-375`).

## NEW bugs

| ID | Severity | Finding | Evidence |
|---|---:|---|---|
| BUG-1 | High | Selected output failure/hot-swap is treated as success after default fallback, so host can lose audio on the chosen non-default sink with no correct banner/state. | `frontend/src/app/services/remote-audio.service.ts:123-140`, `frontend/src/app/pages/room/room.page.ts:1009-1021`, `frontend/src/app/pages/room/room.page.ts:2622-2633`, `frontend/src/app/pages/room/room.page.ts:665-675` |
| BUG-2 | Low | `subscribeMidConflictWarnings` grows unbounded across long churn because keys include UUID track names and are never cleared. | `frontend/src/app/services/sfu-client.service.ts:100`, `frontend/src/app/services/sfu-client.service.ts:1743-1747`, absent from clears at `sfu-client.service.ts:423-443`, `sfu-client.service.ts:1472-1498`, `sfu-client.service.ts:1515-1538` |

STATUS: BUGS — High
