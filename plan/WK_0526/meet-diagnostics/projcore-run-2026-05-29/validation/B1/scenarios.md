# B1 Scenarios — Local Mic-Energy Metric in Diagnostics (R1)

**Batch**: B1  
**Requirement**: R1 — populate `outboundAudioLevel`, `outboundAudioEnergy`, `micSilent` on every diagnostic sample for all clients.  
**Branch**: feat/meet-diagnostics-audio-20260529  
**Written**: 2026-05-29  
**Test strategy**: primary = node-assert unit tests over the pure helper
`frontend/src/app/services/mic-energy.ts::deriveOutboundAudioFields()`, run with
`npx tsx frontend/src/app/services/sfu-client.spec.ts` (or a parallel spec file mirroring its style).
Secondary = manual smoke on http://localhost:4700.

---

## Acceptance Criteria Map

| AC | Truth-table rows covered | Primary proof |
|----|--------------------------|---------------|
| AC1 | TT-1 | Unit SC-1 |
| AC2 | TT-2, TT-3 | Unit SC-2, SC-3 |
| AC3 | TT-1 (both roles) | Unit SC-1 + Manual SM-1 |
| AC4 | TT-4 | Unit SC-4 |
| AC5 | (design constraint) | Unit SC-5 + Manual SM-2 |
| AC6 | (design constraint) | Unit SC-6 |

---

## Unit Scenarios (SC-*)

File under test: `frontend/src/app/services/mic-energy.ts`  
Export under test: `deriveOutboundAudioFields(input: AudioSourceInput): OutboundAudioFields`

```
type AudioSourceInput = {
  audioSource: { audioLevel: number; totalAudioEnergy: number } | null;
  hasLiveAudioTrack: boolean;  // track exists + readyState === 'live'
  micEnabled: boolean;         // track.enabled
};
type OutboundAudioFields = {
  outboundAudioLevel: number | null;
  outboundAudioEnergy: number | null;
  micSilent: boolean | null;
};
```

Each unit case calls `deriveOutboundAudioFields()` with fabricated inputs and asserts the
exact return value.

---

### SC-1 — Active mic with audible signal (Truth-table row 1, AC1, AC3)

**Given** `audioSource = { audioLevel: 0.42, totalAudioEnergy: 12.7 }`,
`hasLiveAudioTrack = true`, `micEnabled = true`

**When** `deriveOutboundAudioFields(input)` is called

**Then**:
- `result.outboundAudioLevel` is `0.42` (exact raw value, > 0)
- `result.outboundAudioEnergy` is `12.7` (exact raw cumulative value)
- `result.micSilent` is `false`

**Assertions**:
```
assert.strictEqual(result.outboundAudioLevel, 0.42)
assert.strictEqual(result.outboundAudioEnergy, 12.7)
assert.strictEqual(result.micSilent, false)
```

---

### SC-2 — Track disabled (muted via track.enabled=false) (Truth-table row 2, AC2)

**Given** `audioSource = { audioLevel: 0.0, totalAudioEnergy: 0.0 }`,
`hasLiveAudioTrack = true`, `micEnabled = false`

**When** `deriveOutboundAudioFields(input)` is called

**Then**:
- `result.micSilent` is `true`
- `result.outboundAudioLevel` is `0` or a near-zero value (≤ 0.01)

**Assertions**:
```
assert.strictEqual(result.micSilent, true)
assert.ok(result.outboundAudioLevel !== null)
assert.ok((result.outboundAudioLevel as number) <= 0.01)
```

---

### SC-3 — Track enabled but near-zero energy (silent mic at source) (Truth-table row 3, AC2)

**Given** `audioSource = { audioLevel: 0.005, totalAudioEnergy: 0.0002 }`,
`hasLiveAudioTrack = true`, `micEnabled = true`

**When** `deriveOutboundAudioFields(input)` is called

**Then**:
- `result.micSilent` is `true` (audioLevel < 0.01 threshold)
- `result.outboundAudioLevel` is `0.005` (raw value stored regardless of silence decision)
- `result.outboundAudioEnergy` is `0.0002`

**Assertions**:
```
assert.strictEqual(result.micSilent, true)
assert.strictEqual(result.outboundAudioLevel, 0.005)
assert.strictEqual(result.outboundAudioEnergy, 0.0002)
```

Note: the silence threshold test is `audioLevel < 0.01`; the raw level is still stored.

---

### SC-4 — No live audio track (RTCAudioSourceStats unavailable) (Truth-table row 4, AC4)

**Given** `audioSource = null`, `hasLiveAudioTrack = false`, `micEnabled = false`

**When** `deriveOutboundAudioFields(input)` is called

**Then**:
- `result.outboundAudioLevel` is `null`
- `result.outboundAudioEnergy` is `null`
- `result.micSilent` is `null`
- No exception is thrown

**Assertions**:
```
assert.doesNotThrow(() => deriveOutboundAudioFields(input))
assert.strictEqual(result.outboundAudioLevel, null)
assert.strictEqual(result.outboundAudioEnergy, null)
assert.strictEqual(result.micSilent, null)
```

---

### SC-5 — micSilent derives from instantaneous audioLevel, NOT totalAudioEnergy (Truth-table row 6)

**Given** two inputs that differ ONLY in `totalAudioEnergy`:
- InputA: `{ audioLevel: 0.5, totalAudioEnergy: 0 }`, `hasLiveAudioTrack: true`, `micEnabled: true`
- InputB: `{ audioLevel: 0.005, totalAudioEnergy: 9999 }`, `hasLiveAudioTrack: true`, `micEnabled: true`

**When** each is evaluated

**Then**:
- InputA → `micSilent = false` (audioLevel 0.5 is above threshold, energy irrelevant)
- InputB → `micSilent = true` (audioLevel 0.005 is below threshold, cumulative energy irrelevant)

**Assertions**:
```
assert.strictEqual(resultA.micSilent, false)
assert.strictEqual(resultB.micSilent, true)
```

---

### SC-6 — No AudioContext created (design constraint, AC6)

**Given** the `mic-energy.ts` module source

**When** the module is inspected

**Then**:
- The string `new AudioContext` does NOT appear anywhere in
  `frontend/src/app/services/mic-energy.ts`
- The module has zero imports of `AnalyserNode` or the Web Audio API

**Verification method**: `grep -n "AudioContext\|AnalyserNode" frontend/src/app/services/mic-energy.ts`
must return no matches. This is a static code check, not a runtime assertion.

---

## Integration Hookup Scenarios (SC-I*)

These verify that `deriveOutboundAudioFields()` is correctly called from the
`collectDiagnostics()` → `buildDiagnosticsPayload()` pipeline — i.e., the wiring.
These are structural code assertions, verified by reading the implementation.

---

### SC-I1 — collectDiagnostics() reads media-source/audio stat from getStats()

**Given** the implementation of `SfuClientService.collectDiagnostics()` in
`frontend/src/app/services/sfu-client.service.ts`

**When** the stats iteration loop is inspected

**Then**:
- There exists a branch `if (stat.type === 'media-source' && stat.kind === 'audio')`
  (or equivalent) within the single `pc.getStats()` pass that already exists at line 308
- No second `pc.getStats()` call is added — only one call per `collectDiagnostics()` invocation
- The extracted `audioLevel` and `totalAudioEnergy` values are passed into
  `deriveOutboundAudioFields()`

**Verification method**: code review / grep:
```
grep -n "media-source\|audioLevel\|totalAudioEnergy\|deriveOutboundAudioFields" \
  frontend/src/app/services/sfu-client.service.ts
```
Must show a single `getStats()` call site and a `media-source` branch within that same
iteration loop.

---

### SC-I2 — buildDiagnosticsPayload() uses sfuDiagnostics fields, not hardcoded null

**Given** the implementation of `room.page.ts::buildDiagnosticsPayload()` at line 2428

**When** the payload construction is inspected

**Then**:
- `outboundAudioLevel`, `outboundAudioEnergy`, `micSilent` are NOT hardcoded to `null`
- Their values derive from `sfuDiagnostics` (passed in from `collectDiagnostics()`)

**Verification method**: code review. The three lines previously at 2443-2445
(`outboundAudioLevel: null`, `outboundAudioEnergy: null`, `micSilent: null`)
must no longer read `null` as a literal — they must reference a computed value from
`sfuDiagnostics` or an equivalent path from the helper.

---

## Manual Smoke Scenarios (SM-*)

Target: http://localhost:4700  
Precondition: `npm run start` (or `ng serve`) on the frontend, dev server up.

---

### SM-1 — Active-mic sample shows live signal (AC1, AC3)

**Given** a room with at least two clients (host in one browser tab + guest in
an incognito tab, or two browser windows), both joined and in-call  
**And** the host's microphone is unmuted and the host speaks continuously

**When** ~8 seconds pass (one `DIAGNOSTICS_LOG_INTERVAL_MS = 7500ms` cadence)

**Then** (check via the diagnostics view or backend log for the most-recent `sample` row):
- `outboundAudioLevel` is a number > 0 (not null, not 0.000)
- `outboundAudioEnergy` is a number ≥ 0 (not null)
- `micSilent` is `false`

Repeat check for the **guest** client's sample row to confirm AC3 (not gated on host role).

**Screenshot**: capture the diagnostics panel / row showing the three field values for both
host and guest samples.

---

### SM-2 — Muted-mic sample shows micSilent:true (AC2)

**Given** same two-client room  
**When** the host mutes their mic (track.enabled = false) and the next diagnostics sample
fires (~7.5s)

**Then** for the host's `sample` row:
- `micSilent` is `true`
- `outboundAudioLevel` is 0 or near-zero (≤ 0.01)

**When** the host unmutes and speaks, and the NEXT sample fires

**Then**:
- `micSilent` flips back to `false`
- `outboundAudioLevel` > 0

**Screenshot**: before (muted) and after (unmuted) sample rows side-by-side.

---

### SM-3 — No additional AudioContext in DevTools (AC6, runtime verification)

**Given** the host is in-call with mic active  
**When** Chrome DevTools → Performance tab → "Web Audio" section (or
`window.__AUDIO_CONTEXTS__` if instrumented) is checked

**Then** no extra `AudioContext` has been created beyond the pre-existing lobby
`AnalyserNode` preview meter context that existed before this batch.

**Verification**: compare AudioContext count before and after joining — must be ≤ 1
(the pre-existing lobby meter), not 2+.

---

## Out-of-Scope Reminder

The following are explicitly NOT tested by B1 scenarios:
- B2: diagnostic warning UI surfacing mic silence
- B3: mic-silence mute toggle
- B4: attribution / view rendering in diagnostics page
- Lobby `AnalyserNode` preview meter (pre-existing, must not regress but not
  re-tested here)
- Any server-side / SFU-side audio energy measurement
