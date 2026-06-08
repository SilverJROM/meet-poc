# sonnet CODE red-team CR1

## Bugs found

| Severity | File:Line | What breaks | Fix |
|----------|-----------|-------------|-----|
| LOW | `remote-audio.service.ts:206-208` | `setVolume` both branches of `if/else` call `persistVolume(clamped)` — `forcePersist` param is dead; always persists regardless. Functionally harmless (old code also always persisted) but misleading signature. | `else { /* skip persist */ }` or collapse to single `persistVolume(clamped)` |
| LOW | `remote-audio.service.ts:372-373` | `reset()` calls `clearSources()` immediately after `clearRegistry()`, which already deleted every entry from `registry`. `clearSources()` iterates an empty map — dead loop. | Remove `clearSources()` call from `reset()` |
| LOW | `remote-audio.service.ts:301-303` | `suspendForTest()` only writes `contextState.set('none')` — already 'none' in the new design. No AudioContext exists. Comment promises "drive the live AudioContext into 'suspended'" but the method is a complete no-op; any e2e that calls `__suspendForTest` to exercise the blocked path cannot trigger a banner anymore. | Either remove the method or replace body with `this.registry.forEach(entry => { entry.el.pause(); })` to actually simulate a blocked-from-play scenario |
| LOW | `remote-audio-playability.ts` + `.spec.ts` (not in diff, still on disk) | `evaluateRemoteAudioPlayability` is no longer imported by `remote-audio.service.ts`, but both files remain. Dead code that still runs in the test suite, maintains a false sense of coverage. | Delete both files |
| LOW | `tile.component.ts:23` + `room.page.html:250,270,290` | `remoteAudioEnabled` input still declared on `TileComponent` and still bound in the template (`[remoteAudioEnabled]="!remoteAudioMixerEnabled()"` = always `true`), but the `effect()` that consumed it was removed from `tile.component.ts`. Input is dead — neither played nor blocked by the tile. | Remove input declaration + all three template bindings |

## Regressions from the mixer removal

**None found** that affect live audio.

- `volume()` / `setVolume` / `setMutedAll` / mute-all: all correctly iterate `registry.values()` and call `applyVolumeState(entry.el)`. ✓  
- `recoverRemoteAudio 'effect'/'interaction'/'visibility'/'keepalive'`: all route through `remoteAudio.recoverPlayback()` → `replayRegistryElements()`. ✓  
- `pageshow` (lifecycle freeze): calls `recoverRemoteAudio('visibility')` via `resumeAfterLifecycleFreeze()`. ✓  
- Voice watchdog: calls `remoteAudio.recoverVoicePlayout(peerId, step)` → `replayRegistryElements(..., peerId)`. ✓  
- `applySpeakerDevice`: correctly uses `audio:not([data-remote-audio])` to exclude registry elements from the DOM sweep, then calls `remoteAudio.applyOutputDevice(deviceId)` for registry elements. No double-apply, no miss. ✓  
- `unblock banner / Enable-audio button`: `remoteAudioBlocked` signal in room.page.ts is mirrored from `remoteAudio.remoteAudioBlocked()`, which is driven exclusively by `refreshBlockedState()` over the registry. ✓  
- No dangling references to `gain / limiter / destination / outputElement.srcObject = destination.stream / bindOutputElement / ensureGraph`. All removed cleanly. ✓  
- `#remoteAudioMixer` viewChild still declared in room.page.ts (L510) and points to a template ref that no longer exists → always returns `null` → `attachOutputElement(null)` → sets `outputPlaying = false` once at init, then `refreshBlockedState()` overwrites it correctly. ✓  
- `feedback-limiter.spec.ts` deleted: no remaining import or reference anywhere. ✓  

## Silent-no-banner paths in the CODE

**None found.**

Key path traced: every `addPublisher` call sets `entry.blocked = true` and calls `refreshBlockedState()` at L421 (synchronously, before the first `await`). `remoteAudioBlocked` is `entries.length > 0 && entries.some(e => e.blocked || e.el.paused)`. A new entry is born blocked, so the banner fires immediately on peer add. It only clears after `el.play()` resolves AND `entry.blocked = false` is written AND `refreshBlockedState()` is called.

The check is `entry.blocked || entry.el.paused` (dual). Even if `entry.blocked` is somehow written `false` without play actually working, `el.paused` catches it on the next `refreshBlockedState()` call (keepalive every N seconds at minimum).

`muted-all` path: `setMutedAll(true)` sets `el.volume = 0, el.muted = true` but does NOT pause the element, so `el.paused` stays false → `remoteAudioBlocked = false`. This is correct (user explicitly muted — no banner needed). ✓

## Test adequacy gaps

**Tests assert outcomes, not just calls.** RA-REG-1 through RA-REG-7 all assert concrete state (`calls[]`, `paused`, `removed`, `volume`, `blocked()`). ✓

**Missing coverage (not gaps that block shipping, but worth noting):**

- `syncPeers` contract: no test for mid-call track-change (same publisher id, different `track` reference triggers `addPublisher` replace). The `current.track !== peer.track` comparison on L257 is the live-unmute path and has no spec coverage.
- `isEntryCurrent` race: no test driving two concurrent `addPublisher` calls for the same id (the dedup-via-generation path).
- `setInCallActive(false)` mid-flight: no test that a pending `addPublisher` awaiting `applySinkId` correctly self-destructs when `setInCallActive(false)` fires mid-await.
- `replayRegistryElements` has no `isEntryCurrent` guard between `sinkApplied` result and `entry.el.play()` (unlike `addPublisher` which checks after sink). If the entry is removed in that window, `play()` is called on a detached element — browsers tolerate this, and `isEntryCurrent` after play correctly suppresses the `blocked=false` write. Harmless but inconsistent with `addPublisher`'s stricter pattern.

---

STATUS: BUGS — five low-severity issues (dead code / dead parameter / broken test hook / orphaned file / dead input binding); none affect live audio playout, banner, recovery, or device routing.
