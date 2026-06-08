# sonnet CODE red-team CR4

## Concurrency/race findings

Traced every interleaving I could construct. The generation + registry-identity guard in `isEntryCurrent` covers them all:

**Guard reviewed (remote-audio.service.ts:520-521):**
```ts
return this.inCall && entry.generation === this.generation && this.registry.get(id) === entry;
```

**Scenario: peer leaves while addPublisher is mid-await (setSinkId or play)**

1. `addPublisher('A', stream1, track1)` → registry.set('A', entry1) → body.append(el1) → **await applySinkId** (~2s gap)
2. syncPeers fires (peer leaves) → `removePublisher('A')` → registry.delete('A'), destroyRegistryElement(entry1) ✓
3. addPublisher resumes → `isEntryCurrent('A', entry1)`: `registry.get('A')` is null → **false** → destroyRegistryElement(entry1) again (double-destroy). All calls are idempotent: removeEventListener on already-removed handlers is a no-op; `el.remove()` on already-removed element is a no-op. **No orphaned element, no audio loss.** ✓

**Scenario: peer leaves-and-rejoins while addPublisher is mid-await**

1. addPublisher('A', stream1) awaiting
2. syncPeers (leave) → removePublisher('A'); then syncPeers (rejoin) → removePublisher('A') no-op → registry.set('A', entry2) → body.append(el2) — both sync, no yield between them
3. Original addPublisher resumes → `registry.get('A') === entry2 ≠ entry1` → destroys entry1 (idempotent) ✓
4. Second addPublisher resumes → isEntryCurrent('A', entry2) → true → play() → audio on correct sink ✓

**Scenario: reset()/leave fires mid-addPublisher**

- `reset()` sets `inCall = false`, bumps generation, calls `clearRegistry()` → destroyRegistryElement(entry) for each entry
- Pending addPublisher resumes → `isEntryCurrent`: `this.inCall` is false → **false** → destroyRegistryElement again (idempotent) ✓

**Scenario: concurrent addPublisher for A and B simultaneously**

Different peer IDs → independent registry slots, no cross-contamination. ✓

**No double-element, orphan element, or lost-update found.**

The window between `document.body.append(el)` and `registry.set(id, entry)` does NOT exist — both are synchronous at lines 436-437 with no await between them. An interleaving that could produce an el-in-body-but-not-registry state is impossible. ✓

---

## Leak findings

**CONFIRMED: `subscribeMidConflictWarnings` not cleared on transport recovery (sfu-client.service.ts:100)**

```ts
private subscribeMidConflictWarnings = new Set<string>();
```

Used in `bindSubscribedMid` (line 1745) to deduplicate console.warn calls. Never cleared in:
- `clearLocalTransportSessionState()` (line 423) — clears all other mid/entry maps but NOT this Set
- `resetForTransportRecovery()` (line 445)
- `closeLiveTracksForExit()` (line 1472)
- `destroy()` (line 1515)

**Impact**: Post-transport-recovery, stale warning keys from the old session accumulate. If the same mid+publisher combination conflicts again in the new session, the warning is suppressed. No effect on audio routing correctness — the Set is logging-only. Practical bound: a few dozen entries at most (bounded by unique MID count × publisher IDs × track names). Not a memory hazard in production, but a correctness omission in cleanup.

**All other maps/arrays verified clean:**

| Resource | Pruning mechanism | Verdict |
|---|---|---|
| `remoteVoiceWatchdogPeers` (room.page.ts:464) | Pruned per-poll for stale peerIds (line 2721-2725); cleared on `stopRemoteVoiceWatchdog` (line 2697) | ✓ |
| `micSilenceWindow` (room.page.ts:467) | Bounded at `MIC_SILENCE_WATCHDOG_WINDOW=6` via shift() (line 3329); cleared on cleanup | ✓ |
| Audio elements in body | `destroyRegistryElement` always calls `el.remove()` — reachable from `removePublisher`, `clearRegistry`, and the `isEntryCurrent` fallback | ✓ |
| Event listeners on el (`playing`/`play`/`pause`/`ended`/`error`) | All removed in `destroyRegistryElement` (lines 525-530) | ✓ |
| `track.addEventListener('ended', onEnded, {once:true})` | Removed in `destroyRegistryElement` line 525; `{once:true}` also auto-removes on fire. Double-remove is no-op. | ✓ |
| `subscribeStuckTimers` | Cleared per-peer in `disarmSubscribeStuckWatchdog`; all cleared in `clearAllSubscribeStuckWatchdogs` on transport reset | ✓ |
| `subscribeBackoffTimers` | Self-deleting on fire (line 195); all cleared in `clearAllSubscribeBackoffTimers` | ✓ |
| `midCallSubscribeRetryTimers` / `midCallSubscribeRetryAttempts` | Cleared per-peer in `clearMidCallSubscribeRetryState`; all cleared in `clearAllMidCallSubscribeRetryState` | ✓ |
| `subscribeRetryAttempts` / `subscribeInitiatedAt` / `subscribeFirstFrameAt` | Deleted per-peer in `tearDownPeerSubscription` (lines 1041-1043) | ✓ |

---

## JROM-scenario trace: host + non-default sink + 2 talkers + A mutes/unmutes + B leaves+rejoins

**Host joins, selects non-default output device (e.g., Bluetooth):**
- `changeAudioOutputDevice(deviceId)` → `remoteAudio.applyOutputDevice(deviceId)` → `this.selectedSinkId = deviceId` stored ✓
- Registry is empty; applyOutputDevice returns true; `selectedAudioOutputId.set(deviceId)` ✓

**Publisher A (Windows + ext-mic) joins and talks:**
- SFU presence → subscribe → `processOntrack` → `remoteStreams.set(streamA)` → `peers()` changes → `syncPeers` effect
- `syncPeers`: A not in registry → `addPublisher('A', streamA, trackA)`
- `applySinkId(el_A, selectedSinkId=deviceId)` → `setSinkId(deviceId)` succeeds → `el_A.play()` → audio on Bluetooth device ✓
- **Host hears A** ✓

**Publisher B (Android) joins and talks:**
- Same pipeline → `addPublisher('B', streamB, trackB)` → `applySinkId(el_B, deviceId)` → `el_B.play()` ✓
- **Host hears both A and B concurrently** (two separate `<audio>` elements, same sink) ✓

**A mutes:**
- No stream/track object change (enabled=false on track or silence sent). `syncPeers` identity check: `current.stream === peer.stream && current.track === peer.track` → true → no addPublisher call → el_A continues playing (silence) ✓

**A unmutes:**
- Same: no addPublisher call; el_A replays audio through Bluetooth device ✓
- **Host hears A again after unmute** ✓

**B leaves:**
- `tearDownPeerSubscription('B')` → `remoteStreams.delete('B')` → `peers()` changes → `syncPeers` → `removePublisher('B')` → el_B destroyed ✓

**B rejoins (with new cfSessionId, new stream):**
- `clearPublisherSubscriptionStateForRetry('B')` called by `handleSfuPresence` (new cfSessionId detected, line 975) → clears stale mids
- Subscribe succeeds → new `remoteStreams.set(streamB2)` → `peers()` changes → `syncPeers` → `addPublisher('B', streamB2, trackB2)`
- `applySinkId(el_B2, selectedSinkId=deviceId)` → `el_B2.play()` → Bluetooth ✓
- **Host hears B again after rejoin** ✓

**No failing step identified. Host hears both throughout.**

---

## Device hot-swap mid-call: output device unplugged

**Finding: UX gap — stale `selectedAudioOutputId` signal, no banner on auto-fallback**

When the selected output device is physically unplugged:

1. `devicechange` fires → `handleDeviceChangeAsync` → `ensureSelectedAudioDevice('devicechange')` — handles **input** (mic) only; output is not re-verified here.
2. `selectedAudioOutputId()` signal does NOT change (nothing clears it on device unplug) → the peers effect does NOT re-fire.
3. At next keepalive (≤15s) or next `peers()` change, the effect fires: `applySpeakerDevice(disconnectedDeviceId)` → `remoteAudio.applyOutputDevice(disconnectedDeviceId)` → `setSinkId(disconnectedDeviceId)` throws → `clearStoredAudioOutputDeviceId()` clears localStorage → `setSinkId('')` (default fallback) → **returns `true`** (fallback succeeded).
4. Because `applySpeakerDevice` returns `true`, the effect's `.then` branch: `if (!applied && ...)` is skipped → `selectedAudioOutputId` signal is **NOT cleared to `''`**.
5. UI still shows the disconnected device name as selected. No "selected speaker is unavailable" banner.

**Audio consequence**: Audio falls back to default device within ≤15s (keepalive) or sooner if `peers()` changes. On macOS, OS-level routing may self-recover immediately. On Windows/Chrome, there may be a brief silent window.

**Root**: `applyMediaElementSinkWithDefaultFallback` returns `true` even when falling back (line 136: `return true` after `setSinkId('')` succeeds). The effect treats `true` as "device applied OK" and never clears the stale signal. The right behavior would be to return a tri-state (success/fallback/failure) or call `onSelectedSinkFailure` and let the effect update the signal.

**No effect on the JROM failure scenario** (device was not unplugged during the test; this is a separate hot-swap edge case).

---

## NEW bugs (table)

| # | Severity | Location | Description |
|---|---|---|---|
| CR4-1 | Minor (logging) | `sfu-client.service.ts:100` | `subscribeMidConflictWarnings` Set not cleared in `clearLocalTransportSessionState`, `resetForTransportRecovery`, or `destroy` — stale warning keys accumulate across transport recoveries, suppressing repeat mid-conflict console.warns post-reconnect |
| CR4-2 | Minor UX | `room.page.ts` effect ~line 665; `remote-audio.service.ts:272` | Output device hot-swap: on physical unplug, `selectedAudioOutputId` signal stays stale (disconnected deviceId); `applyMediaElementSinkWithDefaultFallback` returns `true` on fallback, so the effect never clears the signal; no "selected speaker unavailable" banner; audio self-heals at next keepalive (≤15s) but UI tracking is wrong |

Neither bug causes audio failure in the JROM scenario.

STATUS: BUGS — MINOR (CR4-1: log-level omission; CR4-2: UX gap with bounded audio recovery window)
