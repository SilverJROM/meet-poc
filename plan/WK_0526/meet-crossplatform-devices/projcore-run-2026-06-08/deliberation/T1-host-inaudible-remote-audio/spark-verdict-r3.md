# spark verdict — T1 round 3 (red-team)

## Blockers found in the fix plan (what breaks + file:line + how to fix)

1. **Hard blocker: volume/mute/limiter stop working if mixer is retired as the audible path**
   - Controls still target mixer-only nodes.
   - `ControlsBarComponent` drives mute/volume via `remoteAudio.setMutedAll` and `remoteAudio.setVolume` (`frontend/src/app/components/controls-bar/controls-bar.component.ts:108-121`).
   - These methods only affect `gain` on WebAudio graph (`frontend/src/app/services/remote-audio.service.ts:195-205`) and never touch tile `<audio>` outputs.
   - Limiter remains mixer-only (`remote-audio.service.ts:56-58`, `518-533`).
   - **Fix:** if per-publisher audible path is used, map mute/volume/limiter semantics to per-element playback (or keep a dedicated mixer/control sidecar used only for gain/limiting).

2. **Hard blocker: `recoverVoicePlayout` becomes a no-op when mixer is disabled**
   - `RemoteAudioService.recoverVoicePlayout()` immediately returns when `mixerEnabled()` is false (`remote-audio.service.ts:352-353`).
   - Remote watchdog depends on this for corrective action (`room.page.ts:2733-2796`).
   - With mixer-only recovery bypassed, stalled `<audio data-remote-audio>` elements won’t be remediated.
   - **Fix:** split recovery by mode: keep existing mixer recovery path and add per-element recovery path (`play()`/sink refresh on `[data-remote-audio]`) when mixer is disabled.

3. **Hard blocker: per-element output sink is not guaranteed on tile remount/layout transitions**
   - Sink replay is called on selected-output effect (`room.page.ts:686-691`) and `changeAudioOutputDevice` (`room.page.ts:1030-1042`), not on tile insertion.
   - Tile audio elements are created/destroyed by layout changes (`room.page.html:286-300`, `252-275`, `279-301`), and there is no tile-mount hook to force setSinkId.
   - If a tile is mounted after last sink-pass, it can remain on default/non-selected sink, reintroducing the A4-like failure in per-element mode.
   - **Fix:** apply sink assignment from tile mount/effect using current selected output and selected-device change triggers.

4. **Blocker risk: mid-overwrite guard can break idempotent/no-duplicate legitimate updates if too strict**
   - Existing no-renegotiation branch unconditionally sets `midToEntry.set(rt.mid, entry)` (`sfu-client.service.ts:1753-1755`), and consensus guard needs to avoid false-fatal collision handling.
   - Naively throwing/aborting on every prior owner mismatch can drop tracks during valid repeat responses.
   - **Fix:** guard only real mid-cross-publisher conflict: retain if same `(mid, publisher, kind)` mapping; otherwise log/ignore only stale duplicate while keeping subscription alive or fallback reconcile safely.

## Regressions the fix would introduce (volume/mute-all/feedback-limiter/sink/autoplay) + mitigation

1. **Volume/mute-all regression**
   - Symptom: controls look active but audible level unchanged after mixer audible path removed.
   - Evidence: `setVolume`/`setMutedAll` only update `this.gain` (`remote-audio.service.ts:200-205`).
   - Mitigation: bind slider/mute to `[data-remote-audio]` playback state (or shared processing graph) on change, not just mixer nodes.

2. **feedback-limiter regression**
   - Symptom: feedback/noise transients increase because limiter bypassed in per-element path.
   - Evidence: limiter creation and chain are mixer-only (`remote-audio.service.ts:58`, `518-533`).
   - Mitigation: keep limiter in an enabled control stage independent of audible transport path.

3. **autoplay recovery regression (per-element)**
   - Symptom: blocked per-element audio persists despite recovery timers.
   - Evidence: `recoverPlayback` is mixer-centric and does `output.play()`/`outputElement` checks (`remote-audio.service.ts:328-349`), while `allSinksPlaying`/evaluate logic also includes per-peer unpaused state but recovery is not dedicated to it (`remote-audio.service.ts:385-395`).
   - Mitigation: explicit per-element `play()` + sink retry in `recoverPlayback` branch when mixer is disabled.

4. **Sink routing UX regression during layout churn**
   - Symptom: newly mounted remote tile may route to default output while selected output remains audible for other elements.
   - Evidence: selector applies to all `video,audio` globally but no deterministic mount-time enforcement (`room.page.ts:2647-2658`).
   - Mitigation: apply selected sink immediately in tile effect and on peer/list updates (plus debounced rerun).

## Confirmations (fix points that survive red-team)

1. Per-publisher path is real and currently disabled only by mixer gating, not missing entirely.
   - Remote tile audio exists with `data-remote-audio` and immediate playback attempt (`tile.component.html:14-16`, `tile.component.ts:57-66`).
   - `unlockAndPlayRemoteSinks` already replays all those elements and applies sink IDs (`remote-audio.service.ts:282-292`).

2. Source-to-playout plumbing for one-to-many is already there via `remoteStreams` plus `TileComponent` using `peer.stream`.
   - `processOntrack` adds tracks per publisher/client into per-peer streams (`sfu-client.service.ts:804-828`).
   - `syncPeers` iterates remote peers and tracks streams (`remote-audio.service.ts:243-261`).

3. Anomaly-B intent (no talker suppression) is still correct: `syncPeers` is additive and not intentionally limiting to one audio source (`sfu-client.service.ts` and `remote-audio.service.ts` data paths).
   - The real risk remains overwrite hygiene in no-renegotiation mid mapping (`sfu-client.service.ts:1753-1755`), not active speaker or social gating.

4. R3 “decode vs sink” disambiguation is still valid and currently incomplete:
   - Inbound `audioLevel` currently relies on `inbound-rtp` only; media-playout-like fields are not yet part of `SfuInboundTrackStats` (`meeting-sessions.service.ts:276-293`).
   - Host playout diagnostics currently include snapshots but not explicit remote-output state needed for definitive routing attribution (`meeting-sessions.service.ts:345-381`, `room.page.ts:3491-3528`).

## New issue / 7th mechanism

- **Layout-driven sink drift for fresh tile nodes**: enabling per-publisher audio without mount-time sink enforcement can silently reintroduce the exact selected-output bug under UI churn (grid/share/strip transitions), even if global `applySpeakerDevice` already runs on device changes.

## 7th issue — NEW
- Per-element autoplay recovery is not mode-aware and currently couples to mixer semantics in recovery APIs; this can leave `<audio data-remote-audio>` elements indefinitely blocked after user interactions unless recover logic is split by mode.

STATUS: REVISE — fix plan is directionally sound but must patch mode-aware control/sink/recovery behavior before implementation.
