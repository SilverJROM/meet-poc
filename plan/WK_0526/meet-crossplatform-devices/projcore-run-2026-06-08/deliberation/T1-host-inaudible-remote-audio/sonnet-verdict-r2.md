# sonnet verdict — T1 round 2

## Q1 — A-mechanism ranking (discriminator evidence file:line)

### The decisive banner logic (room.page.ts:L650-658)

```typescript
if (!this.remoteAudioMixerEnabled() || !hasSources) return;  // L657
const playing = contextState === 'running' && outputPlaying;
this.remoteAudioBlocked.set(!playing);                        // L659
```

Two distinct silent paths suppress the banner:
- **Path α**: `hasSources = false` → L657 early return → banner NEVER set → "no banner" even with silence
- **Path β**: `hasSources = true` AND context `running` AND `outputPlaying = true` → `playing = true` → `remoteAudioBlocked.set(false)` → banner NEVER set, element "playing" but audio goes wrong place

The "no banner" fact is consistent with BOTH paths. The discriminator between them is: did `sources.size` stay 0 (α, A3) or did sources get added but audio route to a deaf sink (β, A4)?

---

### Ranking most → least likely

**#1 — A4 (sinkId routing — ordering bug) — PRIMARY SUSPECT, banner-path β**

The decisive ordering gap I can prove from code:

`unlockAndPlayRemoteSinks` (called from join gesture, remote-audio.service.ts:L263-319):
- **L279**: `await this.applySinkId(this.outputElement, deviceId)` — `setSinkId(selectedDevice)` called HERE, while `outputElement.srcObject` is still **null** (first call; `bindOutputElement()` hasn't been called yet because `sources.size=0`)
- **L297**: `this.bindOutputElement()` — only reached when `sources.size > 0` (L294 guard); sets `output.srcObject = destination.stream` for the FIRST time

`recoverPlayback()` (remote-audio.service.ts:L328-350), called from `addSource:L474` with **no deviceId**:
- **L339**: `await this.applySinkId(output, deviceId)` — `deviceId = undefined` → returns immediately at L87 (`if (!element || deviceId === undefined) return true`) → **setSinkId NOT called**
- **L340**: `this.bindOutputElement()` — srcObject set to `destination.stream`
- **L342**: `await output.play()` — **play() called here, with whatever sinkId is currently on the element**

So the actual first-play sequence for a remote peer arrival is:
1. Join gesture: `setSinkId(selectedDevice)` called on element with srcObject=null (L279)
2. Remote peer: `syncPeers` → `addSource` fires `recoverPlayback()` async + `bindOutputElement()` sync
3. `bindOutputElement()` (sync, in syncPeers): srcObject changes null→destination.stream; if Chrome does NOT persist sinkId across srcObject assignment → sinkId resets to default
4. `recoverPlayback()` (async): no deviceId → setSinkId NOT called → `output.play()` fires with sinkId = **default** (if step 3 reset it)
5. `setTimeout(0)` `unlockAudioFromGesture` → L279 again: `setSinkId(selectedDevice)` — this time srcObject IS already set → should persist; BUT element is already playing to default (step 4) AND `bindOutputElement()` in this call is a no-op (srcObject unchanged) → sinkId re-applied while element is mid-play

Whether Chrome preserves sinkId across a srcObject assignment cannot be proven from source code alone. But the observed behavior (Meet per-element works, our mixer element doesn't) is the functional proof. Meet sets `srcObject = track` and `setSinkId(device)` with srcObject already set (the correct order); our app sets `setSinkId` BEFORE srcObject (wrong order for the first play path).

The result: audio plays to DEFAULT (laptop speakers), host is on headphones → silence. Other apps use the default → speakers audible if listening there. Meet uses `<audio srcObject=directTrack setSinkId=selectedDevice>` with correct ordering → headphones get audio.

Explains all four facts simultaneously:
- No banner: sources.size > 0 → hasSources=true; context running; outputPlaying=true → playing=true → banner off ✓
- Silence: audio routes to DEFAULT instead of selected device ✓  
- Specific device selected: exactly the sinkId failure point ✓
- Meet works same device: Meet uses per-publisher direct srcObject with correct set order ✓

**#2 — A3 (orphaned graph → sources.size=0) — HIGH SECONDARY, banner-path α**

Proof that A3 produces a no-banner silent state (remote-audio.service.ts:L507-535, L464-478):

`ensureGraph()` on a closed context (L508-513):
```typescript
if (!this.context || this.context.state === 'closed') {
  this.context = new AudioContextCtor();  // NEW context
  ...
}
if (!this.gain) { this.gain = this.context.createGain(); ... }  // L514: NOT null if context was closed
```

If `context.state === 'closed'` at the time of the call, a new `AudioContext` is created BUT `this.gain`, `this.limiter`, `this.destination` are NOT nulled. `if (!this.gain)` at L514 is false → no new gain created → `this.gain` still references the node from the CLOSED context. Same for limiter (L518), destination (L528).

`addSource()` (L464-478):
```typescript
try {
  const context = this.ensureGraph();                               // L466: new context
  const source = context.createMediaStreamSource(...);              // L467: source in NEW context
  source.connect(this.gain!);                                       // L468: gain from CLOSED context → InvalidStateError
  ...
  this.sources.set(id, { ... });                                    // L472: NEVER REACHED
  this.sourcesVersion.update((v) => v + 1);                        // L473: NEVER REACHED
} catch (err) {
  console.debug('[media] remote audio mixer source failed', err);   // L476: SWALLOWED SILENTLY
}
```

`sources.size` stays 0. `debugSnapshot().mixedPeerIds.length = 0` → `hasSources = false` → L657 early return → banner suppressed. Silent failure with no indicator.

A3 requires the AudioContext to become `closed` mid-call outside of `reset()` (the only code path that correctly nulls gain/limiter/destination, L444-462). This happens on iOS when the OS kills the audio session (page backgrounded), but is less likely for a desktop host. A3 is a real defect but probably not the JROM-session trigger.

**#3 — A1 (gesture guard) — DEMOTED for "no banner"**

On iOS strict-autoplay: `output.play()` rejected (non-gesture) → `outputPlaying = false`. IF sources were added (`hasSources = true`), the banner would fire. "No banner" means A1 on iOS is INCONSISTENT with "sources present" — unless sources were also 0 (overlaps with A3).

On desktop Chrome: `output.play()` from `recoverPlayback()` (non-gesture, post prior-interaction) SUCCEEDS → `outputPlaying = true` → context running → no banner. But then audio goes to… whatever sinkId is set. This merges with A4 (the sinkId question determines audibility). A1 standalone doesn't explain desktop Chrome silence with a valid device.

**#4 — A6 (keepalive gain=0) — DEMOTED for "no banner"**

If Chrome auto-suspends the context (gain=0 keepalive doesn't prevent it) → `contextState = 'suspended'` → `playing = false` → banner fires IF `hasSources = true`. "No banner" demotes A6 as a standalone cause.

**#5 — A5 (SPOF architecture) — structural property, not a mechanism**

Explains WHY one failure silences everyone, not WHAT the failure is.

**#6 — A2 (autoplay-suspend) — RULED OUT**

If context suspended WITH sources present: `hasSources = true`, `contextState !== 'running'` → `playing = false` → `remoteAudioBlocked.set(true)` → BANNER SHOWS. The host saw no banner → A2 (suspended with sources) is contradicted by evidence. Pure-autoplay-suspend is off the table as the primary mechanism.

---

## Q2 — Anomaly B verdict: SEQUENTIAL (B2) — proof file:line

**B1 (mid-overwrite) is NOT a live bug under normal operation.**

**No-renegotiation else branch (sfu-client.service.ts:L1747-1756):**
```typescript
} else {
  // No renegotiation — CF mids should be valid (non-empty) in this path
  for (const rt of responseTracks) {
    if (!rt.mid) continue;  // L1750: CF returns mid:"" for ALL remote-subscribe → ALL skipped
    ...
    this.midToEntry.set(rt.mid, entry);  // NEVER REACHED for remote subscriptions
  }
}
```
CF always returns `mid:""` for remote-subscribe tracks (documented in sfu-client.service.ts comment block around L1662-1665). Every `rt.mid` is falsy → `continue` → nothing written to `midToEntry` from this branch. B1 overwrite via no-renegotiation path is physically impossible given CF's actual SFU behavior.

**Renegotiation path (sfu-client.service.ts:L1619-1729):**

At L1640: `existingMids` is captured from ALL transceivers BEFORE `setRemoteDescription`. Publisher-1's mids are IN `existingMids`.

At L1719-1729: `newTransceiverMids = transceivers.filter(t => !existingMids.has(t.mid))` — publisher-1's mids are EXCLUDED (they ARE in existingMids).

`reconcileSubscribedMids(responseTracks, newTransceiverMids, ...)` only maps publisher-2's `responseTracks` to `newTransceiverMids` (publisher-2's NEW transceivers). Publisher-1's entries in `midToEntry` are not touched.

`nextSubscribed` is initialized as `new Map(subscribedBefore)` which includes ALL of publisher-1's entries → publisher-2's entries ADDED → `subscribedTracks.set(nextSubscribed)` preserves both → **publisher-1's state is fully preserved throughout publisher-2's subscribe**.

**processOntrack (sfu-client.service.ts:L804-829) is additive:**
```typescript
const stream = this.remoteStreams.get(publisherClientId) ?? new MediaStream();
stream.addTrack(track);
this.remoteStreams.set(publisherClientId, stream);
```
Never removes a publisher's stream when another arrives.

**B2 verdict — evidence from timeline:**
- Peer2/Win (5429774b): bytes climbing 00:25:30 → stop ~00:26:45
- Gap at 00:26:52 (7s — consistent with teardown notification propagation + subscribe latency)
- Phone Peer2 (5bd47c7c): bytes start 00:27:00

Sequential sessions, ~7-15s apart. Never concurrent in diagnostics. `clearPublisherSubscriptionStateForRetry` would only fire if the 10s stuck watchdog triggered for publisher-1 — but `subscribeFirstFrameAt` was set (ontrack fired, bytes flowing) → `planSubscribeRetry` returns `reason: 'healthy'` → no retry → no clearing. Publisher-1's state stayed intact until the presence departure event.

**Verdict: B2 (sequential sessions). No concurrent mid-overwrite bug exists on the normal subscribe path.**

---

## Q3 — Fix set: per-publisher-elements + R3 diagnostics

### Architecture recommendation: per-publisher unmuted `<audio>` elements (Meet-style)

This is the correct structural fix. The Web-Audio mixer introduces an entire class of failure modes (A3, A4, A5) that do not exist in Meet's per-publisher approach, and these failure modes are hard to fully rule out without exhaustive instrumentation. Moving to per-publisher elements dissolves all four mechanisms simultaneously:

| Mechanism | Status after per-publisher elements |
|-----------|-------------------------------------|
| A1 (play guard) | Dissolved — each element plays its own stream; no single `sources.size>0` gate |
| A3 (orphaned graph) | Dissolved — no AudioContext at all for audio playout; no graph to orphan |
| A4 (sinkId on dest stream) | Dissolved — `setSinkId(device)` on `<audio srcObject=directTrack>` is the WebRTC-tested path |
| A5 (SPOF) | Dissolved — one element failing doesn't silence others |

### Concrete change list (file:line)

**remote-audio.service.ts — addSource becomes per-element manager:**

1. **L464-478 `addSource()`**: Instead of creating a Web-Audio source node and connecting to the gain, create an unmuted audio element:
   ```
   const el = document.createElement('audio');
   el.autoplay = true;
   el.playsInline = true;
   el.srcObject = new MediaStream([track]);
   await this.applySinkId(el, this.lastKnownDeviceId);  // setSinkId AFTER srcObject ← correct order
   document.body.appendChild(el);
   el.play().catch(...)
   this.sources.set(id, { stream, track, element: el, ... });
   ```

2. **L480-492 `removeSource()`**: Pause and remove the per-publisher element, remove from DOM.

3. **L507-535 `ensureGraph()`**: Can be removed entirely (or kept for keepalive/gain feature only). The `contextState` signal and the `unlockAndPlayRemoteSinks`/`resume()` machinery can be removed if AudioContext is dropped.

4. **L538-544 `bindOutputElement()`**: Remove or make no-op (no single output element needed).

5. **L263-319 `unlockAndPlayRemoteSinks()`**: Remove the mixer-specific block (L264-304). The `audio[data-remote-audio]` scan at L282-292 already handles per-element unlocking — per-publisher elements should use `data-remote-audio` attribute so they are covered by this existing loop.

6. **L321-326 `applyOutputDevice()`**: Iterate `this.sources.values()` and apply `setSinkId` to each element.

**room.page.ts:**

7. **L654 `hasSources` in banner effect**: Change to `this.peers().some(p => !!p.stream)` — relies on peer stream presence rather than `mixedPeerIds`.

8. **L631-633 `attachOutputElement` effect**: Remove (no single output element needed).

### If keeping the mixer (defense-in-depth patch bundle)

If the architectural change is deferred, these four patches close the confirmed defects:

**Patch A — Fix sinkId ordering in both play paths (closes A4 ordering bug):**

`remote-audio.service.ts:L294-304` (`unlockAndPlayRemoteSinks`): Move `applySinkId(outputElement, deviceId)` to AFTER `bindOutputElement()` inside the `sources.size > 0` block:
```
// Before (wrong order — sinkId set while srcObject may be null):
// L279: applySinkId → L297: bindOutputElement() → L299: output.play()

// After (correct order — srcObject set before sinkId):
// L294-block: bindOutputElement() → applySinkId(output, deviceId) → output.play()
```

`remote-audio.service.ts:L328-350` (`recoverPlayback()`): Same swap:
```
// Before: L339 applySinkId → L340 bindOutputElement → L342 play()
// After:  L340 bindOutputElement → (moved) applySinkId → L342 play()
```

**Patch B — Pass deviceId to recoverPlayback from addSource (closes sinkId blind spot):**

`remote-audio.service.ts:L474`: `void this.recoverPlayback().catch(...)` passes no deviceId, so `applySinkId(output, undefined)` is a no-op even after Patch A. Add a `lastAppliedDeviceId: string | undefined` field to the service; update it in `unlockAndPlayRemoteSinks` when `deviceId` is applied; use it in `addSource`:
```
void this.recoverPlayback(this.lastAppliedDeviceId).catch(...)
```

**Patch C — Fix orphaned graph on context rebuild (closes A3):**

`remote-audio.service.ts:L508-513` (`ensureGraph()`): After `this.context = new AudioContextCtor()`, add:
```typescript
this.gain = null;
this.limiter = null;
this.destination = null;
```
This forces the `if (!this.gain)` / `if (!this.limiter)` / `if (!this.destination)` blocks to create fresh nodes on the new context. Without this, nodes from the closed context persist, causing `InvalidStateError` in `addSource:L468`.

**Patch D — Remove sources.size guard (closes A1 and pre-warms element from gesture):**

`remote-audio.service.ts:L294`: Remove `&& this.sources.size > 0` from the condition. Always call `bindOutputElement()` + `output.play()` when `mixerEnabled && outputElement`. The element plays the (currently empty) `destination.stream` silently — no audible consequence, but the element is pre-warmed with a gesture.

### R3 diagnostics — concrete fields

**Field 1 — `media-playout` stat capture (sfu-client.service.ts, after inbound loop ~L754):**
```typescript
for (const stat of stats.values()) {
  if (stat.type !== 'media-playout') continue;
  playoutStats = {
    audioLevel: numberOrNull(stat.audioLevel),
    totalAudioEnergy: numberOrNull(stat.totalAudioEnergy),
    totalSamplesDuration: numberOrNull(stat.totalSamplesDuration),
  };
}
```
Add `playoutStats?: { audioLevel: number | null; totalAudioEnergy: number | null; totalSamplesDuration: number | null }` to `SfuDiagnosticsSnapshot` (meeting-sessions.service.ts:L324-343).

**Interpretation key for A3 vs A4 disambiguation:**
- `jitterBufferEmittedCount` climbing + `media-playout.audioLevel > 0` → audio IS reaching OS output → sinkId routing issue (A4); audio goes to wrong physical device
- `jitterBufferEmittedCount` climbing + `media-playout.audioLevel = 0` → decoded but not reaching any output → context suspended, mixer gain=0, or orphaned graph (A3/A2/A6)
- `jitterBufferEmittedCount` flat + `bytesReceived` climbing → jitter buffer holding; context suspended before decode even emits (pure A2)

**Field 2 — `remoteAudioContextState` in emitted payload (meeting-sessions.service.ts:L345+):**
Add `remoteAudioContextState: string | null` to `DiagnosticsPayload`. Capture from `remoteAudio.contextState()` at collection time.

**Field 3 — `totalAudioEnergy` per inbound track (sfu-client.service.ts:L729-754):**
Add `totalAudioEnergy: numberOrNull(stat.totalAudioEnergy)` to the inbound-rtp push block. Update `SfuInboundTrackStats` (meeting-sessions.service.ts:L276) to include `totalAudioEnergy?: number | null`.

---

## New issues found this round

**New precision on A4 (not surfaced at R1 granularity):** The specific code-level gap is that `recoverPlayback()` at L474 is called without `deviceId` from `addSource`. This means even in a "correct" call where `output.play()` works, `applySinkId(output, undefined)` is a no-op → the sinkId applied at the join gesture (L279) is the only sinkId applied before the FIRST `output.play()`. If that sinkId was set when `srcObject = null` and Chrome doesn't persist it across srcObject change, there is no code path that re-applies the selected sinkId before `recoverPlayback()`'s `output.play()`. The `setTimeout(0)` re-unlock DOES re-apply it but only AFTER the element has already started playing. This gap wasn't isolated as a distinct file:line hole at R1.

**No new 7th mechanism found beyond round1-synthesis.md.** The A1–A6 table from R1 is complete. The B1 vs B2 question is resolved to B2. No additional silent-failure path was found. The A4 precision above is a sharpening of an existing mechanism, not a new one.

---

STATUS: AGREE — primary root cause is A4 (sinkId ordering bug: `setSinkId(selectedDevice)` applied before `srcObject` is set at L279, and `recoverPlayback()` called without deviceId from `addSource:L474` so no re-application before first `output.play()`); A3 is a confirmed secondary defect (ensureGraph orphaned-graph swallow at L508-513 + L468 + L475); fix set = per-publisher unmuted `<audio srcObject=directTrack setSinkId=device>` elements (Meet-style, dissolves A1/A3/A4/A5 in one structural move) or, as defense-in-depth minimum, Patches A–D above; ship R3 diagnostics (`media-playout` stat + `remoteAudioContextState`) so next call is definitive on A3 vs A4.
