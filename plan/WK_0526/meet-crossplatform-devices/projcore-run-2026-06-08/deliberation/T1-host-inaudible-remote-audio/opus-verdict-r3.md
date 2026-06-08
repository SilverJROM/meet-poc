# opus verdict — T1 round 3 (red-team)

## Blockers found in the fix plan
NONE that block — but ONE material regression that MUST be handled in the fix (below), else we trade an audio bug for a controls bug.

## Regressions the fix would introduce + mitigation
**REG-1 (material) — volume + mute-all lost on the per-tile audio path.** The tile `<audio>` effect (tile.component.ts:56-67) sets `audio.muted = false` and `play()` but NEVER reads `RemoteAudioService.volume()` or `mutedAll()`. Those signals only affect the MIXER gain (remote-audio.service.ts:197,204). The controls bar drives them (controls-bar.component.ts:71/109/121 → setVolume/setMutedAll). If we retire the mixer from the audible path, the volume slider and the "mute all remote" button become NO-OPS.
- **Mitigation (REQUIRED in FIX-A):** in the tile audio effect, set `audio.volume = clamp(remoteAudio.volume(), 0, 1)` and `audio.muted = remoteAudio.mutedAll()` reactively (both are signals → the effect re-runs). Note HTMLMediaElement.volume caps at 1.0 → lose the mixer's 1.3 boost (MAX_VOLUME) — acceptable, or clamp the slider to 1.0. Keep RemoteAudioService as the volume/mute STATE owner; tiles consume it.

**REG-2 (minor) — brick-wall feedback limiter lost.** The mixer's DynamicsCompressor (remote-audio.service.ts:58,518-527) tamed same-room feedback peaks. Per-element playout drops it. For a normal remote call (host + distant friend) feedback isn't in play; same-room multi-device is the only exposure. Mitigation: accept for now (log as known); OR keep a parallel muted analysis-only path. Do NOT reintroduce the mixer as the audible path just for this. Flag in changes.md.

## Confirmations (fix points that SURVIVE red-team)
- **A4 genuinely dissolved:** tile `<audio>` has `srcObject = peer.stream` (a DIRECT MediaStream, tile.component.ts:60), NOT a Web-Audio destination stream. `setSinkId` on a direct-MediaStream element is the WebRTC-tested, reliable path — this is exactly why per-publisher elements fix the sink-routing bug.
- **Sink IS applied to tile audio:** `applySpeakerDevice` (room.page.ts:2648-2658) queries ALL `video, audio` elements → covers tile audio; the selectedAudioOutputId effect (room.page.ts:685-690) depends on `peers()` so it re-applies on peer/tile mount. (Implementer must VERIFY the tile element is in the DOM when it runs — add a per-tile sink-apply on the audio effect itself as belt-and-suspenders.)
- **Autoplay handled BETTER than the mixer:** tile emits `remoteAudioBlocked` on play() reject (tile.component.ts:65) and the gesture unlock scans `audio[data-remote-audio]` (remote-audio.service.ts:282) which INCLUDES tile elements → covered. The per-element banner is also not blind to the sources=0 case (the A3 banner-blindness goes away).
- **R2 + no-suppression preserved:** one unmuted `<audio>` per remote peer, none gated by active-speaker → all concurrent publishers audible. Satisfies JROM's directive.
- **B guard:** throwing on cross-publisher mid collision routes into the existing subscribe-retry/rollback (sfu-client.service.ts:1758-1761 catch → rollbackSubscribeMutation) → it does NOT drop a publisher; it retries. Safe, and consistent with no-suppress.

## New issue / 7th mechanism
- **REG-1 is the new actionable item this round** (volume/mute-all wiring) — fix plan must absorb it. Not a new ROOT cause; a fix-completeness gap.
- No 7th playout root-cause mechanism. Consensus root-cause stack stands.

STATUS: AGREE — fix plan is sound WITH the named adjustment: re-wire volume()/mutedAll() onto the per-tile audio elements (REG-1) and note the feedback-limiter drop (REG-2). With those folded in, the per-publisher-elements + A3/A1 hardening + B guard + R3 diagnostics plan is implementation-ready.
