# spark verdict — T1 round 3 (red-team)

## Blockers found in the fix plan (what breaks + file:line + how to fix)

1. **Hard blocker: volume/mute/limiter are still bound to the mixer graph only.**
   - `ControlsBarComponent` drives mute/volume through `RemoteAudioService.setMutedAll` / `setVolume` (`frontend/src/app/components/controls-bar/controls-bar.component.ts:108-121`).
   - Those methods only touch the WebAudio `gain` node (`frontend/src/app/services/remote-audio.service.ts:195-205`) and do not touch per-tile `<audio>` elements.
   - If the single mixer is retired from audible output, host MUTE/VOLUME controls become cosmetic and active feedback limiter disappears (`remote-audio.service.ts:56-58`, `516-533`).
   - **Fix:** while in per-publisher audible mode, either:
     - keep a lightweight control layer (`gain` + limiter) that all tile streams feed through, or
     - explicitly apply `audio.muted`/`audio.volume` (bounded) to every `[data-remote-audio]` element on mixer-value changes.

2. **Hard blocker: recovery path becomes non-functional in mixer-disabled mode.**
   - `remoteAudio.recoverVoicePlayout()` exits immediately when mixer is disabled (`frontend/src/app/services/remote-audio.service.ts:352-353`), so the remote-voice watchdog can no longer drive any recovery action once the per-element path is active (`frontend/src/app/pages/room/room.page.ts:2733-2796`).
   - With no audible mixer path, this is a real behavior regression for stalled per-peer playback.
   - **Fix:** wire playback recovery in the per-publisher path (e.g., per-element `play()` retries + optional muted/volume guard) and keep existing action selection tied to per-track watchdog counters.

3. **Hard blocker: new per-element sinks are not guaranteed to reapply selected output on UI reconfiguration that recreates tile DOM.**
   - Sink application is tied to output-change effect (`room.page.ts:686-691`) and peer-list effect (`room.page.ts:634-639`), both keyed to `selectedAudioOutputId` and `peers`.
   - `applySpeakerDevice` is not called on tile component mount/rebind; if layout branch swaps recreate tile components (grid↔share-layout/strip) without peer-set changes, a fresh `[data-remote-audio]` element can remain on default output.
   - **Fix:** on tile creation/update, apply sink to that element directly (and also from `TileComponent` effect) using the selected device id from room state or a shared helper.

## Regressions the fix would introduce (volume/mute-all/feedback-limiter/sink/autoplay) + mitigation

1. **Volume/mute-all regression**
   - `setVolume` and `setMutedAll` currently only affect `this.gain` (`remote-audio.service.ts:195-205`) and are no-ops functionally once mixer is unused for playout.
   - **Mitigation:** add per-element gain/mute synchronization keyed from `remoteAudio.mutedAll()` / `remoteAudio.volume()` in tile rendering/recovery.

2. **feedback-limiter gap**
   - The limiter is only in mixer graph (`FEEDBACK_LIMITER_PARAMS` and limiter chain at `remote-audio.service.ts:518-533`).
   - Removing audible mixer output drops that clipping control unless replaced.
   - **Mitigation:** either preserve limiter through a sidecar chain or implement bounded per-element envelope control (or both) before rollout.

3. **autoplay recovery fragility for per-element-only mode**
   - `recoverPlayback()` currently drives only mixer recovery (`remote-audio.service.ts:328-349`) and then checks sink state (`remote-audio.service.ts:385-395`).
   - In mixer-disabled mode this does not `play()` tile elements, so blocked state requires explicit user gesture or tile-level retries.
   - **Mitigation:** augment per-element path recovery to call play on `[data-remote-audio]` with selector-scoped fallback semantics similar to `unlockAndPlayRemoteSinks` (`remote-audio.service.ts:282-305`).

4. **mid-overwrite guard correctness risk (B2 defense)**
   - Proposed guard at no-renegotiation branch (`sfu-client.service.ts:1753-1755`) must be conditional, not unconditional overwrite rejection.
   - If implemented as “throw-on-existing-mid” only, any legitimate idempotent/replayed map refresh can abort subscribe for an active publisher.
   - **Mitigation:** guard only when existing owner/publisher mismatch or incompatible kind track; otherwise idempotently rebind and continue.

## Confirmations (fix points that survive red-team)

1. Per-publisher route is already present and can be enabled with template + binding changes:
   - `TileComponent` has per-remote `<audio data-remote-audio>` playback and immediate `play()` attempt (`tile.component.html:14-16`, `tile.component.ts:57-66`).
   - Sink application function already targets all media elements and can be reused for these tags (`room.page.ts:2647-2658`).
   - Sink replay on gesture/recovery already iterates all `[data-remote-audio]` (`remote-audio.service.ts:282-292`) and would support selected-output routing if kept.
2. The anomaly-B guard direction is still valid: direct map overwrite in no-reneg branch remains a suppression risk and needs explicit policy (`sfu-client.service.ts:1753-1755`), and current diagnostics/collection still gives clean inbound packets + no explicit per-source drop signal in that path.
3. R3 fields for stronger attribution still matter and remain missing:
   - `SfuInboundTrackStats` currently lacks `media-playout` energy-level fields (`meeting-sessions.service.ts:276-293`).
   - Host-side playout context/output state isn’t emitted in `DiagnosticsPayload` (`meeting-sessions.service.ts:345-381`, `room.page.ts:3491-3528`).
   - Existing diagnostics UI uses current `inboundTracks` and does not expose per-element sink-mapping (`diagnostics.page.ts:405-420`, `438-449`).

4. "7th mechanism" candidates still open:
   - R3 should also verify per-element sink correctness across tile remount/layout switches, as this is not explicitly covered by current effects.

STATUS: REVISE — keep per-publisher audible path, but block plan must add explicit per-element volume/mute/limiter + per-element recovery + per-element mount sink application and a non-fatal mid-guard policy before implementation.
