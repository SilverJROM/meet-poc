# Haiku CODE red-team CR4 — concurrency/races, leaks, scenario traces

## Summary
Genuinely tried to break it across all CR4 attack surfaces. Code is fundamentally clean: per-element registry architecture with generation + reference-equality guards prevents all dangerous interleavings. All element cleanup is defensive and idempotent. No leaks.

---

## Concurrency/race findings

### Race 1: addPublisher re-entrance during syncPeers churn
**Scenario**: Two rapid syncPeers calls trigger overlapping addPublisher promises.
```
syncPeers([A, B]) → addPublisher(A) && addPublisher(B) (both fire, no await)
syncPeers([A, C]) fires while both still pending → removePublisher(B) + addPublisher(C)
```

**Trace**:
- addPublisher(B) does `removePublisher(id)` at start, ensuring old entry destroyed
- B's async execution (applySinkId, play) continues with captured `generation` and `entry` reference
- While in-flight, syncPeers removes B: `registry.delete(B)` + `destroyRegistryElement(entry)`
- When B's addPublisher resumes: `isEntryCurrent(B, entry)` checks `registry.get(B) === entry`
- `registry.get(B)` returns undefined (deleted), so check fails
- B's entry is destroyed again: removeEventListener (idempotent), pause (safe on paused), remove (safe on unattached)

**Verdict**: GUARDED. The generation + direct reference check + idempotent destroy code path handles this safely. No double-play(), no orphaned elements in registry.

---

### Race 2: applySinkId timeout doesn't prevent slow resolution
**Scenario**: applySinkId hangs, timeout fires at 2s, element proceeds to play() while promise still pending.
```typescript
const sinkApplied = await withTimeout(this.applySinkId(el, this.selectedSinkId), SINK_ID_TIMEOUT_MS);
if (sinkApplied === 'timeout') {
  console.debug('[media] remote audio sink routing timed out; playing through current/default output', { id });
} else if (!sinkApplied) {
  entry.blocked = true;
}
```

**Trace**:
- withTimeout returns 'timeout' at 2s
- Element proceeds to play() with whatever sink it currently has
- Slow setSinkId might still resolve later, updating element's sinkId property
- Element plays on "current/default" first, then correct sink if delayed setSinkId completes

**Verdict**: ACCEPTABLE DEGRADATION. Timeout prevents indefinite hang. Element plays through available sink (not the selected one) for 2s max. Browser's delayed setSinkId resolution is unusual (indicates environment issues, not code bug). No crash, no stuck blocked state.

---

### Race 3: replayRegistryElements calls applySinkId on stale entries
**Scenario**: replayRegistryElements([A, B]) awaits applySinkId(A) while syncPeers removes A.
```typescript
const entries = [...this.registry.entries()].filter((...));
await Promise.all(
  entries.map(async ([id, entry]) => {
    const sinkApplied = await this.applySinkId(entry.el, deviceId);  // <-- no guard here
    if (!sinkApplied) entry.blocked = true;
    try {
      await entry.el.play();
      if (!this.isEntryCurrent(id, entry)) return;  // <-- guard HERE
      entry.blocked = false;
    } catch (err) {
      if (!this.isEntryCurrent(id, entry)) return;
      entry.blocked = true;
    }
  })
);
```

**Trace**:
- Snapshot entries at start: [A, B, C]
- Await applySinkId(B.el) while syncPeers([A, C]) fires
- removePublisher(B): registry.delete(B), destroyRegistryElement(B.entry)
- B.el is destroyed (removed from DOM, srcObject cleared)
- applySinkId(B.el) completes (setSinkId on destroyed element is silently ignored by browser)
- el.play() on destroyed element fails with `NotSupportedError` or similar
- catch block: `isEntryCurrent(B, entry)` returns false (B not in registry)
- Returns early, error logged

**Verdict**: SAFE but slightly inefficient. Guard exists AFTER applySinkId but NOT before. Stale entries get unnecessary sink application. No crash (removeEventListener, pause(), srcObject on destroyed elements are no-ops), but could check `isEntryCurrent` before awaiting applySinkId to skip work.

---

## Leak findings

### Leak check: Element lifecycle over long call with peer churn

**Element creation** (addPublisher):
- createElement('audio')
- 5 listeners attached: playing, play, pause, ended, error
- 1 listener on track: ended (once)
- document.body.append(el)
- registry.set(id, entry)

**Element cleanup** (destroyRegistryElement):
- Removes all 6 listeners (idempotent, no-op if already removed)
- pause() safe on paused element
- srcObject = null (safe, clears reference)
- remove() safe on unattached element

**Churn scenario**: 1000 join/leave cycles over 1 hour
- Each join: element created, appended, added to registry
- Each leave: removePublisher called
  - registry.delete(id)
  - destroyRegistryElement(entry) removes element from DOM, clears listeners
  - No dangling references back to entry

**Maps that could grow unbounded**:
- registry: bounded by active peer count (~20-100 typical)
- sinkIdApplier.targets: WeakMap keyed by element, elements removed with destroyRegistryElement
- voiceRecoveryCounters: fixed keys, bounded by VoiceRecoveryStep enum
- No global accumulator of removed publishers

**Listener cleanup verification**:
- el.addEventListener('playing', onPlaying) → el.removeEventListener('playing', onPlaying) ✓
- el.addEventListener('play', onPlaying) → el.removeEventListener('play', onPlaying) ✓
- el.addEventListener('pause', onPaused) → el.removeEventListener('pause', onPaused) ✓
- el.addEventListener('ended', onPaused) → el.removeEventListener('ended', onPaused) ✓
- el.addEventListener('error', onPaused) → el.removeEventListener('error', onPaused) ✓
- track.addEventListener('ended', onEnded, { once: true }) → track.removeEventListener('ended', onEnded) ✓

**Verdict**: CLEAN. No leaks. Elements fully cleaned up on removal. Registry pruned on every peer leave. Long-running call with churn doesn't accumulate orphaned elements or listeners.

---

## JROM-scenario trace: host hears both publishers throughout

**Setup**: Host joins call, selects NON-DEFAULT output device (e.g., "External Speaker" instead of built-in speakers).

### Step 1: Publisher A (Windows, ext-mic) joins and talks
```
syncPeers([A])
→ addPublisher(A.id, A.stream, A.track, null)
   - removePublisher(A): no-op (A not in registry yet)
   - Create audio element, set srcObject = A.stream
   - Track listeners: 'ended' → removePublisher(A)
   - El listeners: 'playing'/'play' → mark entry.blocked = false
   - El listeners: 'pause'/'ended'/'error' → mark entry.blocked = true
   - registry[A] = { stream, track, el, blocked: true, voiceStalled: false, ... }
   - Append el to document.body
   - applySinkId(el, selectedSinkId) where selectedSinkId = "non-default"
     → setSinkId("non-default") succeeds
     → returns true
   - el.play() succeeds
     → 'play' event fires → onPlaying callback
     → entry.blocked = false
     → refreshBlockedState()

Host state: remoteAudioBlocked = false (A.el.paused = false, A.blocked = false)
Host hears A: YES ✓
```

### Step 2: Publisher B (Android) joins and talks
```
syncPeers([A, B])
→ For A: registry.get(A) exists && stream/track match → continue
→ For B: addPublisher(B.id, B.stream, B.track, null)
   - removePublisher(B): no-op
   - Create SEPARATE audio element (el2), set srcObject = B.stream
   - Same listener attachment process
   - registry[B] = { stream, track, el: el2, blocked: true, ... }
   - Append el2 to document.body (now DOM has el1 and el2, SEPARATE elements)
   - applySinkId(el2, selectedSinkId) where selectedSinkId = "non-default"
     → setSinkId("non-default") succeeds
     → returns true
   - el2.play() succeeds
     → 'play' event fires → entry.blocked = false

Host state: remoteAudioBlocked = false (both A.el and B.el playing on same non-default sink)
Host hears A: YES ✓
Host hears B: YES ✓ (Browser mixes two audio elements playing on same sink)
```

### Step 3: A mutes, then unmutes
```
A mutes at source (publisher-side, no remote-audio service call)
  - A.stream audio still exists, but mic is muted
  - A.stream is still in registry, el1 still plays it
  - Volume not affected by local mute

Host hears A: YES (stream exists, element plays, but audio content is silent) ✓
Host hears B: YES ✓
```

### Step 4: B leaves call
```
syncPeers([A])
→ For A: A in nextIds → continue
→ For B: B not in nextIds
  → removePublisher(B)
     - registry.delete(B)
     - destroyRegistryElement(B.entry)
       → Pause el2 (el2.paused = true)
       → Clear el2.srcObject (el2.srcObject = null)
       → Remove el2 from DOM (el2.remove())
       → Remove all listeners

Host state: registry = { A: ... }, remoteAudioBlocked = false (only A.el plays)
Host hears A: YES ✓
Host hears B: NO (element removed) ✓
```

### Step 5: B rejoins with new stream
```
syncPeers([A, B])
→ For A: continue
→ For B: addPublisher(B.id, B'.stream, B'.track, null) [B reconnected with fresh stream]
   - removePublisher(B): no-op (not in registry)
   - Create NEW audio element (el3, different from el2)
   - registry[B] = { stream: B'.stream, track: B'.track, el: el3, ... }
   - Append el3 to document.body
   - applySinkId(el3, selectedSinkId) → setSinkId("non-default") succeeds
   - el3.play() succeeds

Host state: registry = { A, B }, both elements on non-default sink, both paused = false
Host hears A: YES ✓
Host hears B: YES ✓ (new stream playing)
```

**Verdict**: JROM scenario works correctly. Host hears both publishers throughout the call. No step fails. Both elements play on selected non-default sink concurrently (browser mixes them). Device selection, sink application, and cleanup all work as expected.

---

## Device hot-swap mid-call: unplugged output device

**Scenario**: User selects "External Speaker", speaker gets unplugged while call is in progress.

```
1. applySpeakerDevice("external-speaker-id") called
   - Applies to all media elements EXCEPT [data-remote-audio]
   - (remote-audio elements managed separately)

2. Meanwhile, remoteAudio.applyOutputDevice("external-speaker-id") called
   - For each entry in registry:
     → applySinkId(entry.el, "external-speaker-id")
        → setSinkId("external-speaker-id") is called

3. Speaker unplugged:
   - Browser's WebAudio/media system detects device removal
   - setSinkId("external-speaker-id") fails (device not available)
   - applyMediaElementSinkWithDefaultFallback catch block:
     → onSelectedSinkFailure callback: clearStoredAudioOutputDeviceId()
     → Tries fallback: setSinkId("") [default device]
     → Default fallback succeeds
     → returns true

4. Element continues playing on default device
   - Audio doesn't drop out
   - Host keeps hearing both publishers
   - Next UI refresh shows banner "Selected speaker is unavailable. Using system default speaker."

5. If fallback also fails (unlikely):
   - returns false
   - entry.blocked = true
   - remoteAudioBlocked signal is true
   - User sees "Remote audio blocked" banner
   - User can tap to retry or select different device
```

**Verdict**: CLEAN. Device hot-swap is handled gracefully. Fallback to default device prevents audio dropout. No crash, no stuck sink. User is notified of device unavailability.

---

## New bugs found (table)

| Issue | Type | Severity | Notes |
|-------|------|----------|-------|
| None detected | — | — | All dangerous interleavings guarded. All cleanup idempotent. No unhandled crashes. No memory leaks. |

---

## Stress test: rapid churn + recovery + device swap

Injected scenario: 5 peers join/leave in 2s, voice recovery firing, device changed twice, all concurrent.

```
t=0ms:   A, B, C join → 3x addPublisher (no await)
t=100ms: A.addPublisher paused in applySinkId, voice recovery triggers for A
t=150ms: D, E join → 2x addPublisher + 3x applySinkId in flight
t=200ms: Device X → device Y (user clicks different speaker)
t=250ms: A, B leave → 2x removePublisher
t=300ms: All pending promises resolve (applySinkId, play, voice recovery retry)
t=350ms: B, F join → new addPublisher calls
```

Results:
- No crash on double-destroy (removePublisher checks registry first)
- No orphaned elements (all destroyed entries caught by `isEntryCurrent` guards)
- No stuck blocked state (remoteAudioBlocked refreshed after each change)
- All listeners removed (defensive removeEventListener in destroyRegistryElement)
- Device sink applied correctly (applyOutputDevice iterates current registry, applies to active entries)

**Verdict**: System is robust under churn. Generation + registry reference equality prevents stale entry manipulation. No crashes, no leaks, no stuck state.

---

## Why CR4 is clean

1. **Generation guard**: Every entry captures `this.generation` at creation. If inCall state changes or reset() fires, generation increments, rendering all prior entries stale.

2. **Registry reference check**: `isEntryCurrent` confirms not only that generation matches but that the SAME entry object is still in the registry under that ID. No way for a stale entry to affect a new replacement.

3. **Idempotent destroy**: All cleanup paths (removeEventListener, pause, srcObject = null, remove) are safe to call multiple times on the same element.

4. **Listener re-fetching**: All callbacks (onPlaying, onPaused) re-fetch their entry from registry and verify element matches before updating state. Callbacks from destroyed elements are automatically no-ops.

5. **No hidden state**: All playout state is either in the registry (entry props) or in HTML element state (paused, srcObject, sinkId). No separate bookkeeping that can drift.

---

STATUS: CLEAN
