# codex55 verdict — T1 round 7

## Q1 — completeness gaps (or none)

One completeness gap remains: **B17 must explicitly diff by current live audio track identity, not only publisher id or `MediaStream` object identity.**

The existing mixer `syncPeers()` already does the right shape of diff: it derives `{ id, stream, track }`, removes departed ids, and rebuilds when either `stream` or `track` changes (`frontend/src/app/services/remote-audio.service.ts:237`, `frontend/src/app/services/remote-audio.service.ts:245`, `frontend/src/app/services/remote-audio.service.ts:253`, `frontend/src/app/services/remote-audio.service.ts:255`, `frontend/src/app/services/remote-audio.service.ts:257`). The v2.1 B17 wording says `addPublisher(id,stream)` for new/changed publishers, but does not state that "changed" means `currentAudioTrack(stream)` changed too.

That matters because SFU `processOntrack()` reuses the existing `MediaStream` for a publisher and calls `stream.addTrack(event.track)` (`frontend/src/app/services/sfu-client.service.ts:820`, `frontend/src/app/services/sfu-client.service.ts:821`, `frontend/src/app/services/sfu-client.service.ts:826`, `frontend/src/app/services/sfu-client.service.ts:827`). If a same-client publisher gets a replacement audio track while the stream object remains the same, a stream-only registry diff can leave the registry attached to an ended/stale first track or fail to re-run sink/play state for the new track. The implementer can copy the current stream+track diff, but the design brief should say it explicitly.

Required wording: `syncPeers()` must derive `audioTrack = currentAudioTrack(peer.stream)` and key registry entries by `{publisherClientId, stream, audioTrack.id/object}`. Rebuild the registry element when either the stream object or selected live audio track changes. Also remove the publisher when there is no live audio track.

Secondary precision gap: **B14's stale guard must check after every awaited operation, including `play()`, not only after `setSinkId()` before append/register.** The design now says re-check after the awaited `setSinkId` before append (`consensus-r4-registry.md` B14-guard), but `play()` is also async. If reset/leave happens while `play()` is pending, a stale continuation must not later clear/set blocked state for the new call. The element itself will be removed if it was already registered, but stale promise continuations can still mutate service state unless guarded.

Everything else is concrete enough for implementation: remote-audio registry ownership in `remote-audio.service.ts`, room effects and banner wiring in `room.page.ts:631-680` and `room.page.ts:2685-2688`, selected-output application in `room.page.ts:2647-2658`, visibility recovery in `room.page.ts:2876-2879`, tile audio removal in `tile.component.html:14-15` / `tile.component.ts:56-67`, diagnostics types in `meeting-sessions.service.ts:276-380`, and diagnostics rendering in `diagnostics.page.html:179-190`.

## Q2 — closers re-attack: B14/B17/B18/B19/B20 each OK or gap

**B14 guard: gap.** Correct direction, but incomplete unless the disposed/generation check is done after every await (`setSinkId`, timeout fallback, and `play`) and before any state mutation. Single-threaded JS is enough only if every async continuation checks the token. A reset path already exists (`remote-audio.service.ts:444-462`) and room lifecycle can invoke cleanup on pagehide/beforeunload (`frontend/src/app/pages/room/room.page.ts:2837`, `frontend/src/app/pages/room/room.page.ts:2844`), so stale continuations are realistic.

**B17 wiring: gap.** The effect target is correct (`room.page.ts:635`), and reusing `syncPeers()` as the diff driver is correct. The missing part is explicit track identity. Since `processOntrack()` can mutate an existing publisher stream by adding a new track (`sfu-client.service.ts:820-827`), a publisher with unchanged client id and unchanged stream object but changed live audio track must still rebuild.

**B18 setSinkId timeout: OK.** Proceeding to `play()` after a timed-out sink apply is the right failure mode in JROM's Chrome environment: default device was audible, and hearing audio on default is better than blocking remote playout forever. It should set diagnostics `sinkApplied=false/effectiveSinkId='default-or-unknown'`, not `remoteAudioBlocked`, unless both selected and default sink attempts fail. The existing helper already falls back to default on rejection (`remote-audio.service.ts:95-110`); the timeout path should mirror that fallback semantics.

**B19 play catch audit: OK, with the B14 token caveat.** Every `play()` catch setting blocked closes the original no-banner class. But catches from stale/reset generations must not set a banner for a left call or a new call. Existing call sites already have scattered catches in tile/playback/recovery (`tile.component.ts:63-66`, `remote-audio.service.ts:286-290`, `remote-audio.service.ts:341-345`, `room.page.ts:2879`); v2.1 correctly centralizes this in the registry path.

**B20 sink reject handling: OK.** Falling back to `''` default is already the right primitive (`remote-audio.service.ts:95-110`), and setting blocked only when selected and default both fail is correct. B16's `{selectedSinkId, effectiveSinkId, sinkApplied}` is sufficient to show wrong-device vs no-playout.

## Q3 — in-scope silence sweep: any silent-no-banner path? (name it or "none")

Yes: **same-client audio track replacement with unchanged stream object, if B17 is implemented as clientId/stream-only diff.**

Path: SFU receives another audio `ontrack` for a publisher and adds it to the existing `MediaStream` (`sfu-client.service.ts:820-827`). `peers()` still exposes the same client id and possibly the same stream object (`room.page.ts:327-336`). A registry diff that only sees publisher id or stream object as unchanged will not rebuild the audio element or update its tracked audio identity. If the old track is ended/silent and the new track is the actual decodable audio, the host has an inbound track but the registry remains attached to stale playout. Because the element may be unpaused and not blocked, the B8 banner may not fire. This is in scope because it is exactly subscribe/ontrack → peer stream → playout wiring.

This path is closed by explicitly carrying the current audio track into `syncPeers()` and rebuilding when `current.track !== nextTrack`, matching the old mixer logic at `remote-audio.service.ts:253-257`.

## Q4 — new item(s)

**B21: B17 must be strengthened to diff registry entries by publisher id + stream + current live audio track, and B14 must guard stale continuations after `play()` as well as after `setSinkId()`.**

No additional root-cause change. The per-publisher registry, no-autoplay, selected-sink-before-play, fallback/timeout, blocked banner, and diagnostics model remain the right fix. The design is not quite implementation-ready until this wording is explicit, because otherwise an implementer can satisfy the literal B17 text and still miss same-client track replacement.

STATUS: REVISE — B17 needs explicit audio-track-identity diffing and B14 needs post-play stale-continuation guarding to close the last in-scope silent-no-banner path.
