# haiku CODE red-team CR1

## Bugs found
None detected. Code is CLEAN.

## Regressions from the mixer removal
**None found.** All post-mixer dependencies correctly rewired:
- `setVolume()`, `setMutedAll()` → apply per-element volume state (L197–209)
- `applyOutputDevice()` → apply per-element sink ID (L269–274)
- `recoverPlayback()`, `recoverVoicePlayout()` → `replayRegistryElements()` (L276–286)
- `playoutDiagnostics()` → per-element snapshot capture (L341–361)
- `setInCallActive()` → generation/lifecycle management (L363–368)
- Volume cap changed 1.3 → 1.0; controls-bar removed "(amp)" label (confirmed in diff)
- Tile component audio element removed; per-element playback now registry-backed (confirmed in diff)

## Silent-no-banner paths
**None found.** Banner state is now service-owned:
- `refreshBlockedState()` (L527–534) sets `remoteAudioBlocked` to **true** if any entry is **blocked** (`entry.blocked || entry.el.paused`)
- Room.page effect (diff, L642) pulls this signal directly: `this.remoteAudioBlocked.set(this.remoteAudio.remoteAudioBlocked())`
- Every state mutation that affects blockedness calls `refreshBlockedState()`:
  - Registry add/remove/clear (L421, L458, L464)
  - Event handlers onPlaying/onPaused (L403, L409)
  - Recovery completions (L491–492, L502)
  - Sink routing failures (L491–492)
- No path exists where a live publisher is in the registry yet `remoteAudioBlocked` stays false; element.paused is read in addition to `entry.blocked` flag, catching transient pauses.

## Test adequacy
**Adequate.** Spec file covers all critical cases:
- **RA-REG-1**: Sink-before-play ordering (setSinkId before el.play) ✓
- **RA-REG-2**: Per-element volume/mute mirrors service state, including clamping ✓
- **RA-REG-3**: reset() clears registry completely (pause, null srcObject, remove) ✓
- **RA-REG-4**: Sticky unlock (late-joiner plays immediately post-gesture) ✓
- **RA-REG-5**: Blocked state tracking (paused element sets banner, replay clears) ✓
- **RA-REG-6**: Deduplication (re-add removes old, one element per id) ✓
- **RA-REG-7**: Volume migration from old mixer era (1.3 → 1.0 clamp) ✓
- ERR9: LatestSinkIdApplier serialization (no concurrent setSinkId) ✓

## Spot checks

### addPublisher ordering & generation guards (L386–451)
- Removes stale entry first (L388) ✓
- Captures generation at entry create (L389) ✓
- Every await after L420 is protected by `isEntryCurrent()` (L430, L437, L443) ✓
- Sink timeout (L423–425) does not mark `entry.blocked=true`; intentional — proceed to play and let result determine state ✓
- Listeners are all removed in `destroyRegistryElement()` (L512–517) ✓

### syncPeers correctness (L240–259)
- Removes peers not in next set (L251–253) ✓
- Detects stream/track change via `===` identity check (L257) ✓
- Dedup via `removePublisher()` first (L388 in addPublisher) ✓
- Concurrent `addPublisher` calls (not awaited, L258) are safe due to generation/idempotency guardrails ✓

### mid-guard in sfu-client (L1710–1737)
- Detects mid reassignment to different (publisherClientId, trackName) ✓
- Throws if existing publisher is LIVE, preventing orphan (L1728) ✓
- Non-live publisher's mid is reused without conflict (L1730) ✓
- Rollback via `touchedMidEntries` is correct: if throw before `rememberTouchedMid()`, mid is not tracked, stays unchanged (correct) ✓
- New entry is not added to `nextSubscribed` if throw (L1736 never reached), so old entry persists in `subscribedTracks` (correct) ✓

### applySpeakerDevice sink routing (room.page.ts L2630–2641)
- Selector `audio:not([data-remote-audio])` correctly excludes all registry elements (which have `data-remote-audio="id"` set at L391) ✓
- Remote elements delegated to `remoteAudio.applyOutputDevice()` (L2640) ✓

### Diagnostics capture (L341–361)
- Snapshots element.paused (actual state, not service flag) ✓
- Snapshots sinkId via `withSink.sinkId` (true applied value) ✓
- Snapshots srcObjectAttached, readyState for proof of media attachment ✓
- Backward compatible (optional in DiagnosticsPayload, L308) ✓

---

**STATUS: CLEAN** — no real bug found in the implemented code. Sink-before-play is enforced, dedup is correct, banner state is derived from service truth, recovery paths are idempotent, and listener cleanup is thorough. Ready for JROM's live app.
