# haiku CODE red-team CR5 (lens L5: adversarial inputs / browser quirks / error paths)

## Findings by probe

### 1. setSinkId-unsupported browsers (iOS Safari, Firefox)
**File:line**: `remote-audio.service.ts:128-156` + `diagnostics.page.ts:105-133`

**Test**: Feed code a browser where `HTMLMediaElement.setSinkId` doesn't exist (common on iOS Safari, Firefox).

**Trace**:
- `applyMediaElementSinkWithDefaultFallback(element, deviceId, {...})` at line 134-135:
  ```typescript
  if (!withSink.setSinkId) return 'selected';  // <-- return without attempting anything
  ```
- Returns `'selected'` even though no sink selection was attempted
- Element will play on default/current speaker (correct behavior)
- No crash ✓

**BUT** — **DISHONEST DIAGNOSTICS**:
- `addPublisher()` calls `applyMediaElementSinkWithDefaultFallback()` → gets `'selected'`
- `updateSinkFallbackState()` sets `effectiveSinkId = deviceId` (line 522)
- In diagnostics page, `playoutDiagnostics()` reports `effectiveSinkId` = the requested deviceId
- User sees "selected speaker: [requested device]" but audio actually plays on default speaker (because setSinkId doesn't exist)
- Per-publisher `sinkId` is null (correctly shows 'sink n/a'), but call-wide summary claims a sink was selected

**Verdict**: **BUG — Dishonest diagnostics.** The code should distinguish between "setSinkId unsupported" vs "setSinkId succeeded". Currently returns `'selected'` for both.

---

### 2. Garbage / missing RTCStats (undefined, null, NaN, negative)
**File:line**: `remote-audio.service.ts:105-121, 619-621`

**Test**: Feed samples where `audioLevel`, `totalAudioEnergy`, `bytesReceived`, `jitterBufferEmittedCount` are undefined, null, NaN, -5, 0, or huge.

**Trace**:
- `sampleWindowHasVoiceEnergy()` at 105-121:
  ```typescript
  if (typeof level === 'number' && Number.isFinite(level)) { ... }
  if (typeof energy === 'number' && Number.isFinite(energy)) { ... }
  ```
  ✓ Checks type AND finiteness. Filters out undefined, null, NaN, negative, Infinity
- `sampleUsable()` at 619-621:
  ```typescript
  return !!sample && Number.isFinite(sample.bytes) && Number.isFinite(sample.emitted);
  ```
  ✓ Defensive checks before arithmetic

**Verdict**: **CLEAN.** No NaN propagation, no false stall verdicts, no crashes. Garbage stats are safely ignored.

---

### 3. Autoplay variants (NotAllowedError, AbortError, NotSupportedError)
**File:line**: `remote-audio.service.ts:479-493, 542-550`

**Test**: Feed code where `element.play()` rejects with different error types.

**Trace**:
- `addPublisher()` at 479-493:
  ```typescript
  try {
    await el.play();
    entry.blocked = false;
  } catch (err) {
    entry.blocked = true;
    console.debug('[media] remote audio registry play rejected', { id, unlocked: this.unlocked, err });
  }
  ```
  ✓ All errors caught, blocked state set to true
- `replayRegistryElements()` at 542-550: same pattern
- Blocked banner will surface ✓
- Recovery logic calls `unlockAndPlayRemoteSinks()` → gesture-based play() will be unblocked ✓

**Verdict**: **CLEAN.** No crash on play() rejection. Blocked state is set correctly. Recovery pathway honest.

---

### 4. Weird device enumeration (empty string, stale id, duplicate)
**File:line**: `remote-audio.service.ts:288-294, 517-523`

**Test**: Feed `selectedAudioOutputId = ''`, stale device id, or duplicate id.

**Trace**:
- Line 289: `this.selectedSinkId = deviceId;` — accepts empty string ✓
- Line 522: `this.effectiveSinkId = usedFallback ? '' : (deviceId ?? null);` — handles empty string ✓
- Line 381: `selectedAudioOutputId: this.selectedSinkId ?? null,` — preserves empty string as null ✓
- Empty string: treated as "default speaker" in `setSinkId('')` call (line 149) ✓
- Stale device id: `setSinkId(staleId)` fails → falls back to default → honest 'default-fallback' ✓
- Duplicate ids: applied to all elements with same id, no dedup issue ✓

**Verdict**: **CLEAN.** Empty string, stale, and duplicate ids are handled.

---

### 5. Degenerate streams (0 audio tracks, track.readyState='ended', srcObject=empty stream)
**File:line**: `remote-audio.service.ts:255-278, 594-597, 428-495`

**Test**: Feed peer with 0 audio tracks, stream with only 'ended' tracks, or already-ended stream.

**Trace**:
- `currentAudioTrack()` at 594-597:
  ```typescript
  const tracks = stream?.getAudioTracks() ?? [];
  return tracks.find((track) => track.readyState !== 'ended') ?? tracks[0] ?? null;
  ```
  — If 0 tracks, returns null ✓
  — If all tracks ended, returns `tracks[0]` (an ended track) ⚠️
  
- `syncPeers()` line 255-278 → filters to `!!peer.stream && !!peer.track` — if track is null, peer is filtered out ✓
- If track is already 'ended':
  ```typescript
  track.addEventListener('ended', onEnded, { once: true });
  ```
  **BUG**: If track is already 'ended', the 'ended' event will NOT fire (event already occurred). The listener will never run. The element will STAY IN THE REGISTRY FOREVER (or until removePublisher is called externally).

- `el.srcObject = stream;` (line 437) — set regardless ✓
- `await el.play();` (line 480) — will likely fail with no live tracks, caught in try/catch ✓, but element stays registered ⚠️

**Verdict**: **BUG — Orphan registry entry.** If `currentAudioTrack()` returns an already-'ended' track, the 'ended' listener will never fire, and the element will leak in the registry. This can happen if a track ends between when we read the stream and when we call addPublisher. Unlikely in practice (tight timing) but possible under high concurrency or slow async.

**Fix**: Check `track.readyState === 'ended'` and return early, or handle ended-track case separately.

---

### 6. Diagnostics payload robustness (old rows missing new fields)
**File:line**: `diagnostics.page.ts:111-149`

**Test**: Fetch old diagnostic payloads missing `effectiveSinkId`, `usedFallback`, `perPublisher` fields.

**Trace**:
- `buildRemoteAudioPlayoutRows()` at 116:
  ```typescript
  return (playout?.perPublisher ?? []).map(...)
  ```
  ✓ Returns empty array if `playout` is null or `perPublisher` is missing
  
- `redactedEffectiveAudioOutputLabel()` at 106:
  ```typescript
  if (!playout) return 'sink n/a';
  if (playout.usedFallback) return 'default fallback';
  ```
  ✓ Handles null/undefined playout
  ✓ Handles missing `usedFallback` field (will be undefined, falsy)
  
- `buildCallWideMediaPlayoutRow()` at 142-148:
  ```typescript
  if (!mediaPlayout) return null;
  return {
    audioLevel: `level ${decimalLabel(mediaPlayout.audioLevel, 3)}`,
    totalAudioEnergy: `energy ${decimalLabel(mediaPlayout.totalAudioEnergy, 6)}`,
    totalSamplesDuration: `samples ${decimalLabel(mediaPlayout.totalSamplesDuration, 3)}s`,
  };
  ```
  ✓ Returns null if mediaPlayout is null
  ✓ `decimalLabel()` handles undefined/null/NaN gracefully (line 583)

**Verdict**: **CLEAN.** Diagnostics page will not crash on old payloads. Missing fields degrade gracefully.

---

### 7. Anything prior lenses missed
- **Already-ended track listener race** (Probe 5 above) — entry leaks in registry if track is already ended
- **Dishonest diagnostics for setSinkId-unsupported browsers** (Probe 1 above) — reports sink selected when browser doesn't support setSinkId
- No other issues found under this lens

---

## NEW bugs (by severity)

| Severity | File:line | What | Fix |
|----------|-----------|------|-----|
| **HIGH** | `remote-audio.service.ts:594-597` | `currentAudioTrack()` returns already-'ended' track; `addEventListener('ended', ...)` never fires; entry leaks in registry forever | Check `track.readyState !== 'ended'` before returning `tracks[0]`; return null if all ended |
| **MEDIUM** | `remote-audio.service.ts:134-135` | `applyMediaElementSinkWithDefaultFallback()` returns `'selected'` when browser doesn't support setSinkId; diagnostics are dishonest | Introduce new return value (e.g., `'unsupported'`) or check setSinkId support and return appropriate flag |

---

## STATUS: BUGS — orphan registry entry (ended track), dishonest diagnostics (unsupported setSinkId)

Streak: **CR4 → CR5: 2 new bugs** (both low-probability-in-practice but real edge cases under concurrency or platform variance).
