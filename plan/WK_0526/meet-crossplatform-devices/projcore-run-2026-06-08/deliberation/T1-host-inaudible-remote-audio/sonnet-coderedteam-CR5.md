# sonnet CODE red-team CR5 (lens L5: adversarial inputs / browser quirks / error paths)

## Findings by probe (1-7)

---

### Probe 1 — setSinkId-unsupported browsers (iOS Safari, Firefox)

**Path**: `applyMediaElementSinkWithDefaultFallback` → line 135: `if (!withSink.setSinkId) return 'selected'`

- **No crash** ✓ — early return before any attempt to call the missing method.
- **Audio plays through default** ✓ — browser uses whatever output it picks; `el.play()` proceeds normally.
- **No false `selectedSpeakerUnavailable`** ✓ — `room.page.ts` sets `selectedSpeakerUnavailable` only on `'default-fallback'` or `'failed'`; the `'selected'` return keeps it false.
- **BUG (LOW)**: `updateSinkFallbackState(deviceId, ['selected'])` runs (line 472), writing `effectiveSinkId = deviceId` and `usedDefaultSinkFallback = false` even though setSinkId was never invoked. The JSON diagnostic download (`playoutDiagnostics()`) reports the requested device ID as the effective sink — **false**. Per-publisher row correctly shows `'sink n/a'` (DOM `sinkId` property is absent on no-setSinkId browsers → null → `redactedAudioOutputLabel(null,…)` → `'sink n/a'`). No banner impact; diagnostic data inaccuracy only.
  → **BUG-CR5-C** (recorded in table below)

---

### Probe 2 — Garbage / missing RTCStats

**`sampleUsable`** (line 619): uses `Number.isFinite` for `bytes` and `emitted`.
- `undefined`, `null`, `NaN`, `Infinity` → `isFinite` = false → sample rejected → `decideVoiceRecovery` returns `'none'` ✓
- Negative but finite (e.g. `bytes: -1`) → `isFinite` = true → sample accepted. Delta can be positive (e.g. −100→−50 = +50 > 0) and pass the `bytesDelta > 0` gate. False trigger is theoretically possible with monotonically-increasing negative counters — spec says unsigned, so this requires a non-spec browser. Low risk.

**`sampleWindowHasVoiceEnergy`** (lines 109–120): `Number.isFinite` guards on both `audioLevel` and `totalAudioEnergy`.
- `undefined`, `null`, `NaN`, `Infinity` → skipped ✓
- All samples garbage → `highestAudioLevel = 0`, `finiteEnergySamples = []` → returns false → voice recovery suppressed ✓

**`remoteVoiceSample` path / `decideVoiceRecovery`**: no NaN/crash vector found ✓

**`classifyRemoteAudioHealth` + `concealmentRatio`** (`remote-audio-health.ts:37–61`):
- **BUG (LOW)**: null guards (`concealed === null || emitted === null`) do **not** cover NaN. If a stat arrives as `NaN` (non-spec but possible from corrupt serialization/parse):
  - `NaN === null` → false → passes null check
  - `NaN + emitted = NaN` → `NaN === 0` → false → no divide-by-zero guard fires
  - `concealmentRatio` returns `NaN`
  - In classifier: `NaN < SILENT_REMOTE_MIN_EMITTED_SAMPLES` → false → floor guard skipped
  - `NaN >= SILENT_REMOTE_CONCEALMENT_RATIO` → false → returns `'ok'`
  - **Silent remote appears 'ok'; badge is suppressed.**
  → **BUG-CR5-B** (recorded below)

**Diagnostics rendering** (`decimalLabel`, `msLabel`, `sumNumbers`, `maxNumber`): all null/undefined-guarded; NaN propagates to display as `'NaN'` string (e.g. `decimalLabel(NaN, 3)` → `'NaN'`) — ugly but no throw ✓

---

### Probe 3 — Autoplay variants

**`addPublisher` play/catch** (lines 479–494): generic `catch(err)` handles all rejection types:
- `NotAllowedError` → `entry.blocked = true` → `refreshBlockedState()` → banner ✓
- `AbortError` (play interrupted by pause/teardown) → same; `isEntryCurrent` check exits cleanly if entry was concurrently removed ✓
- `NotSupportedError` → same ✓

No type-discrimination of errors is done — all become `blocked = true`. Conservative: AbortError (transient) shows the same banner as a policy block. Recoverable via `recoverPlayback()` → `replayRegistryElements` → `entry.el.play()` again. If policy still blocks, stays blocked. If AbortError (race), retry succeeds. Intentionally conservative design, not a bug.

**`replayRegistryElements`** (line 530–554): same pattern, same conclusion ✓

**Gesture during pending `addPublisher` await**: `isEntryCurrent` is checked after both the sink-apply await (line 474) and the play await (line 481/487). Concurrent teardown (generation bump, registry clear) is detected; `destroyRegistryElement` is called and function returns cleanly ✓

Double-destroy from the concurrent path: `removeEventListener` idempotent, `pause()` in best-effort try/catch, `el.remove()` on detached element is no-op ✓

---

### Probe 4 — Weird device enumeration

**No output devices / `selectedAudioOutputId = undefined`**: `applySinkId(el, undefined)` → `deviceId === undefined` → returns `'selected'` immediately (line 133) → default output, no crash ✓

**Empty string `''`**: `applyMediaElementSinkWithDefaultFallback(el, '')` → not undefined, passes. `setSinkId('')` = "route to system default" — spec-defined, should succeed ✓. `redactedAudioOutputLabel('', ...)` → line 101: `sinkId === ''` → `'default'` ✓

**Stale device ID** (removed device): `setSinkId(staleId)` throws `NotFoundError` → outer catch → fallback `setSinkId('')` → `'default-fallback'` → `updateSinkFallbackState` → `usedFallback = true`, `effectiveSinkId = ''`. `selectedSpeakerUnavailable.set(true)` in room.page ✓. `applySinkId` (private) does not pass `onSelectedSinkFailure` — fine because no caller in this service registers one.

**Devicechange storm** (`LatestSinkIdApplier`): concurrent `apply(el, 'A')` and `apply(el, 'B')` while in-flight:
- Second call sets `state.desiredDeviceId = 'B'`, `state.rerun = true`, returns same `inFlight` promise.
- `drain` reruns with `'B'` after `'A'` finishes; resolves once with the device-B result.
- Both callers get device-B result. First caller runs `updateSinkFallbackState('A', [device-B-result])` → `effectiveSinkId = 'A'`; immediately overwritten by second caller's `updateSinkFallbackState('B', [device-B-result])` → `effectiveSinkId = 'B'`.
- Final state correct. Transient wrong intermediate (microseconds) — not observable ✓

---

### Probe 5 — Degenerate streams

**MediaStream with 0 audio tracks**: `currentAudioTrack(stream)` → `tracks = []` → `find()` → undefined → `?? tracks[0]` → undefined → `?? null` → null. `addPublisher`: `!track` → true → early return. No element created ✓

**`track.readyState === 'ended'` at addPublisher time**:
- **BUG (MEDIUM)**: `currentAudioTrack` (line 596) fallback: `tracks.find(t => t.readyState !== 'ended') ?? tracks[0] ?? null`. When ALL tracks are ended, returns `tracks[0]` — an already-ended track (truthy).
- `addPublisher` receives an ended-but-truthy track; `!track` is false → proceeds.
- Element created, `srcObject` set, volume applied.
- **`track.addEventListener('ended', onEnded, { once: true })`** — line 453. The `ended` event already fired; `once` listeners on a past event never re-fire. `onEnded` → `removePublisher(id)` is **never called**.
- `el.play()` may resolve (silence from ended stream) or reject. Either way, `onEnded` is gone.
- Entry stays in `registry` as `blocked = true` (or false if play resolves) **until the peer leaves the room**. If blocked, banner persists. If playing-silence, entry stays playing silence — false healthy state.
- No self-heal path. Manual removal only when `syncPeers` stops seeing that peer.
  → **BUG-CR5-A** (recorded below)

**`srcObject` set to already-ended stream**: same code path as above — same outcome.

**Element `el` 'ended' event** (line 457: `el.addEventListener('ended', onPaused)`): may fire asynchronously when a stream-backed element's underlying tracks end. If it does fire: `onPaused` → `entry.blocked = true` → banner. But entry stays in registry (only `onEnded` on the track calls `removePublisher`).

---

### Probe 6 — Diagnostics payload robustness (old rows missing new fields)

**`remoteAudioPlayout` missing from old rows**: `entry.payload.remoteAudioPlayout` is `?` optional (line 408 of meeting-sessions.service.ts). `buildRemoteAudioPlayoutRows(null, …)` → `null?.perPublisher ?? []` → `[]` → no rows → template `@if (…length)` skips section ✓

**`effectiveSinkId` / `usedFallback` missing** (pre-CR4 rows): `playout.effectiveSinkId` → undefined → `redactedAudioOutputLabel(undefined, …)` → line 99: returns `'sink n/a'` ✓. `playout.usedFallback` → undefined → falsy → `default fallback` path not taken ✓

**`perPublisher` missing**: `playout?.perPublisher ?? []` → `[]` → no rows ✓

**`sfuDiagnostics.mediaPlayout` missing**: optional field → `?? null` → `buildCallWideMediaPlayoutRow(null)` → returns null → template `@if` skips ✓

**`sfuDiagnostics` absent entirely**: `entry.payload.sfuDiagnostics?.inboundTracks ?? []` → `[]` → no rows. `sfuDiag(entry)` → null → template `@if(sfuDiag(…); as sfu)` skips ✓

**`inboundTracks[].audioLevel` / `totalAudioEnergy` absent** (old SFU stats rows): both typed `?` optional in `SfuInboundTrackStats`. `decimalLabel(undefined, 3)` → `'n/a'` ✓

**No throw path found in diagnostics page for any old-row scenario** ✓

---

### Probe 7 — Additional findings

**`combineSinkApplyResults([])` (empty registry)**: `.some()` on empty array = false → returns `'selected'`. `updateSinkFallbackState(deviceId, [])` → `effectiveSinkId = deviceId` even with no peers. Harmless (no elements to route) but a minor accuracy gap ✓ (consistent with BUG-CR5-C character, not a new bug)

**`setVolume(NaN)`**: `Number.isFinite(NaN) ? NaN : DEFAULT_VOLUME` → uses default ✓

**Double-destroy safety**: `destroyRegistryElement` called twice: all ops idempotent (removeEventListener, pause in try/catch, srcObject=null, el.remove) ✓

**`withTimeout` timer cleanup**: `timeoutId` assigned synchronously inside Promise constructor before `await` suspends; `clearTimeout` in `finally` always fires ✓

**`shortHash('')`**: loop body skipped → deterministic hash of seed constant, no throw ✓

---

## NEW bugs (table)

| Severity | File:line | What | Fix |
|----------|-----------|------|-----|
| MEDIUM | `remote-audio.service.ts:596` + `:453` | `currentAudioTrack` falls back to `tracks[0]` even when already ended. `addPublisher` then calls `track.addEventListener('ended', onEnded, {once:true})` — event already fired, listener never triggers. Entry stays in registry as blocked until peer leaves. Persistent blocked banner; no self-heal. | Guard in `addPublisher`: `if (!this.inCall \|\| !track \|\| track.readyState === 'ended') return;`. Optionally also fix `currentAudioTrack` to return null when all tracks are ended: `return tracks.find(t => t.readyState !== 'ended') ?? null`. |
| LOW | `remote-audio-health.ts:56–61` | `classifyRemoteAudioHealth` null-guards (`=== null`) do not cover NaN. NaN stats: `NaN + emitted = NaN`, `NaN < 48000 = false`, `NaN >= 0.5 = false` → returns `'ok'` instead of `'unknown'`. Silent-remote badge suppressed for NaN stats. | Add `Number.isFinite` guards: `if (concealed === null \|\| !Number.isFinite(concealed) \|\| emitted === null \|\| !Number.isFinite(emitted)) return 'unknown';`. Same in `concealmentRatio`. |
| LOW | `remote-audio.service.ts:135` + `:521–522` | On no-setSinkId browsers, `!withSink.setSinkId` returns `'selected'`. `updateSinkFallbackState(deviceId, ['selected'])` then writes `effectiveSinkId = deviceId` — the requested device ID — even though setSinkId was never invoked. JSON diagnostic download (`playoutDiagnostics()`) reports a false effective sink. Per-publisher row correctly shows `'sink n/a'`; `selectedSpeakerUnavailable` stays false (no false banner). | Return a new sentinel like `'unsupported'` (or `'default-fallback'`) when `!withSink.setSinkId`, and let `updateSinkFallbackState` write `effectiveSinkId = ''` (actual default). Or skip updating `effectiveSinkId` entirely for the unsupported path. |

---

STATUS: BUGS — MEDIUM (BUG-CR5-A: ended-track orphan blocks registry entry with no self-heal)
