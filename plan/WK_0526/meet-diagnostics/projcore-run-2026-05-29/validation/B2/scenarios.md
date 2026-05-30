# B2a Scenarios — Root-cause silent-mic capture: energy gate + tolerant constraints + bounded non-destructive recovery (R3)

**Batch**: B2a
**Requirement**: R3 — Robust microphone selection (external mic actually used). On a silent/failed default the app does NOT silently publish a dead track — it attempts recovery and/or surfaces R2. (R2 banner UI is B2b — out of scope here. B2a = capture-side root-cause fix + the recovery half of R3.)
**North-star anchors**: NS9 (root-cause in OUR capture path, hardware confirmed good), NS4 (deferral OFF — each slice finishes, no shims), NS5 (WebRTC mic can't be e2e'd headless ⇒ pure unit tests + manual localhost:4700 + forced-silent path).
**Branch**: feat/meet-diagnostics-audio-20260529 (@ 3c1ebff)
**Written**: 2026-05-30
**Scope**: B2a ONLY. Does NOT cover B2b (watchdog banner, "Switch microphone" UI, mid-call continuous polling) or B3/B4/B5/B6.

**Test strategy** (mirrors B1):
- **Primary = node-assert unit tests** over the new PURE helpers, run with
  `cd /home/agjrom/websites/meet-poc/frontend && npx tsx src/app/services/<spec>.spec.ts`
  using `import assert from 'node:assert/strict'` and a final `console.log('<module>: all assertions passed')` line (same convention as `mic-energy.spec.ts`).
- **Secondary = manual smoke** on `http://localhost:4700` (PM2 `meet-poc-fe` + `meet-poc-be`) for the live join→silent-track→keeps-audio behavior that headless cannot capture.
- Build MUST be green for `frontend` (NS5). `cd frontend && npm run build`.

---

## What B2a implements (the OUTCOMES these scenarios assert)

1. **Tolerant constraints** — `AUDIO_PROCESSING_CONSTRAINTS` (media.service.ts:34) EC/NS/AGC become `{ ideal: true }` (applied-when-supported, never hard-required). `deviceId:{exact}` is still set when a device is chosen.
2. **ONE shared outbound-audio-source reader** on sfu-client — the existing media-source/audio extraction (sfu-client.service.ts:340-349) is factored into a reusable PURE extractor + a getStats-backed reader, reused by diagnostics AND the energy gate. NO second AudioContext / meter. Reuses B1's `outboundAudioSource.audioLevel` + `totalAudioEnergy` + `MIC_SILENCE_LEVEL_THRESHOLD = 0.01` from `mic-energy.ts`.
3. **Post-INITIAL-publish ONE-SHOT energy gate** hooked at room.page.ts:1313-1319 (the `state?.status === 'published'` block). Gated on: in-call + mic enabled + unmuted + live audio track.
4. **SUSTAINED discriminator (LOCKED by JROM)** — silence decided by `totalAudioEnergy` NOT increasing across a ~3s window (flat delta < epsilon) corroborated by `audioLevel < threshold`. NEVER a single instantaneous `audioLevel` sample. A quiet-but-WORKING mic (energy still accumulating) must NOT trigger recovery.
5. **Bounded NON-DESTRUCTIVE recovery (LOCKED by JROM)** — at most ONCE near initial publish, gated on enabled+unmuted; conservative = relax constraints + re-acquire the SAME device once (do NOT silently switch the user's chosen device). If re-acquire is unavailable OR also-silent → KEEP the best existing track + surface a warn via the existing `deviceFailureNotice` ("We can't detect sound from your microphone…"); NEVER leave the user with zero audio tracks.

---

## Acceptance Criteria → Proof Map

| AC | What it asserts | Proof type | Scenarios |
|----|-----------------|-----------|-----------|
| AC1 | `audioConstraints(true, deviceId)` shape: EC/NS/AGC `{ideal:true}` + `deviceId:{exact}`; no device ⇒ no deviceId key; `audio:false`⇒`false` | **Unit (pure)** | U-1, U-2, U-3 |
| AC2 | Shared reader returns SAME audioLevel/totalAudioEnergy the diagnostics path reads (one source of truth) on a synthetic stats report | **Unit (pure)** | U-4, U-5, U-6 |
| AC3 | CORE discriminator: flat energy + low level ⇒ SILENT; increasing energy (even low level) ⇒ WORKING; boundary quiet-but-working ⇒ WORKING | **Unit (pure)** | U-7, U-8, U-9, U-10, U-11 |
| AC4 | Recovery bounded to ONE attempt, gated enabled+unmuted; still-silent KEEPS existing track + sets `deviceFailureNotice`; never zero audio tracks | **Unit (pure, decision predicate)** + Manual | U-12..U-16 + M-2 |
| AC5 | Conservative recovery re-acquires the SAME selected deviceId (does not switch device) | **Unit (pure, decision predicate)** + Manual | U-17 + M-2 |

**Unit-provable (deterministic, node):** AC1, AC2, AC3, and the recovery-decision predicate (AC4 + AC5 logic).
**Manual-only (live mic, localhost:4700):** the end-to-end join → silent track captured → recovery fired once → audio kept behavior (M-1, M-2, M-3). Per NS5 the real mic path cannot be exercised headless; a **forced-silent path** drives the deterministic manual proof.

---

## Pure-function contracts under test

The implementation MUST expose these as framework-free, DOM-free, AudioContext-free pure functions so they are unit-testable via `tsx`. (Names are guidance; assert on behavior + the named export the impl chooses. If the impl names differ, the test report must map them.)

```ts
// media.service.ts — already private; AC1 asserts its observable output shape.
audioConstraints(audio: boolean, deviceId?: string): boolean | MediaTrackConstraints

// NEW pure extractor (factored out of sfu-client.service.ts:340-349),
// e.g. in mic-energy.ts or an outbound-audio-source.ts sibling.
// ONE source of truth used by BOTH collectDiagnostics() and the energy gate.
extractOutboundAudioSource(stats: RTCStatsReport): {
  audioLevel: number | null;
  totalAudioEnergy: number | null;
} | null

// NEW pure discriminator over a sustained window (the CORE of AC3).
// Returns 'silent' ONLY when energy is flat across the window AND level is below threshold.
type EnergySample = { totalAudioEnergy: number | null; audioLevel: number | null };
classifyMicCapture(window: EnergySample[], opts?: {
  energyDeltaEpsilon?: number;   // flat-energy tolerance
  levelThreshold?: number;       // defaults to MIC_SILENCE_LEVEL_THRESHOLD (0.01)
}): 'silent' | 'working' | 'unknown'

// NEW pure recovery-decision predicate (the AC4/AC5 logic, no I/O).
type RecoveryInput = {
  classification: 'silent' | 'working' | 'unknown';
  micEnabled: boolean;          // track.enabled
  micUnmuted: boolean;          // !track.muted  (or readyState gating per impl)
  hasLiveAudioTrack: boolean;
  alreadyAttempted: boolean;    // one-shot guard
  selectedDeviceId: string | undefined;
};
type RecoveryDecision = {
  action: 'reacquire-same-device' | 'keep-and-warn' | 'none';
  deviceId: string | undefined; // when reacquiring, MUST equal selectedDeviceId
};
decideMicRecovery(input: RecoveryInput): RecoveryDecision
```

> If the impl folds the discriminator + predicate into one pure module, that is fine — the assertions below target observable inputs→outputs, not module layout. The non-negotiables: **(a) zero `new AudioContext` / `AnalyserNode` introduced** (reuse the getStats source), and **(b) the discriminator + recovery decision are pure and node-runnable**.

---

## Unit Scenarios (U-*) — deterministic, node/tsx

### --- AC1: Tolerant constraints (media.service.ts:34 + audioConstraints) ---

### U-1 — EC/NS/AGC are `{ideal:true}`, deviceId is `{exact}` when chosen
**Given** `audioConstraints(true, 'mic-abc-123')`
**Then** the returned `MediaTrackConstraints`:
- `echoCancellation` deep-equals `{ ideal: true }`
- `noiseSuppression` deep-equals `{ ideal: true }`
- `autoGainControl` deep-equals `{ ideal: true }`
- `deviceId` deep-equals `{ exact: 'mic-abc-123' }`

**Assertions**:
```
const c = audioConstraints(true, 'mic-abc-123') as MediaTrackConstraints;
assert.deepStrictEqual(c.echoCancellation, { ideal: true });
assert.deepStrictEqual(c.noiseSuppression, { ideal: true });
assert.deepStrictEqual(c.autoGainControl, { ideal: true });
assert.deepStrictEqual(c.deviceId, { exact: 'mic-abc-123' });
```
**Concrete rejection of the old behavior**: `c.echoCancellation` MUST NOT be the bare boolean `true` (the pre-B2a hard-required form). `assert.notStrictEqual(c.echoCancellation, true)`.

### U-2 — No deviceId chosen ⇒ no `deviceId` key, still `{ideal:true}` processing
**Given** `audioConstraints(true)` (deviceId undefined)
**Then**:
- `'deviceId' in c` is `false` (key absent, not `{exact:undefined}`)
- `echoCancellation/noiseSuppression/autoGainControl` are each `{ ideal: true }`

**Assertions**:
```
const c = audioConstraints(true) as MediaTrackConstraints;
assert.strictEqual('deviceId' in c, false);
assert.deepStrictEqual(c.echoCancellation, { ideal: true });
assert.deepStrictEqual(c.autoGainControl, { ideal: true });
```

### U-3 — `audio:false` short-circuits to `false`
**Given** `audioConstraints(false, 'mic-abc-123')`
**Then** the return value is the boolean `false` (no object).
```
assert.strictEqual(audioConstraints(false, 'mic-abc-123'), false);
```
> Note: `audioConstraints` is currently `private`. The impl must keep its observable shape provable — either export a pure builder it delegates to, or the test exercises it through `replaceAudioTrack`/`preflight` constraint capture. The test report must state which path was used; assertions on the four properties above are the contract.

---

### --- AC2: ONE shared outbound-audio reader = one source of truth ---

### U-4 — Extractor returns the media-source audio entry's values from a synthetic stats report
**Given** a synthetic `RTCStatsReport` (a `Map`) containing:
- one `{ type:'media-source', kind:'audio', audioLevel:0.37, totalAudioEnergy:88.5 }`
- one `{ type:'candidate-pair', nominated:true, currentRoundTripTime:0.04 }` (noise to prove selectivity)
- one `{ type:'media-source', kind:'video' }` (noise — wrong kind)

**When** `extractOutboundAudioSource(stats)` is called
**Then** it returns `{ audioLevel: 0.37, totalAudioEnergy: 88.5 }`.
```
assert.deepStrictEqual(extractOutboundAudioSource(stats), { audioLevel: 0.37, totalAudioEnergy: 88.5 });
```

### U-5 — Extractor == the diagnostics path (identical extraction, one source of truth)
**Given** the SAME synthetic stats report as U-4
**When** the value the diagnostics path produces (`collectDiagnostics()`'s `outboundAudioSource`, which after B2a MUST call the shared extractor) is compared to a direct `extractOutboundAudioSource(stats)` call
**Then** the two are deep-equal — proving the energy gate and diagnostics read ONE source.

**Verification**: a node test that imports the shared extractor and asserts the diagnostics builder uses the same function. Concretely:
- `extractOutboundAudioSource(stats)` deep-equals `{ audioLevel:0.37, totalAudioEnergy:88.5 }`.
- **Static check** (code review / grep): `collectDiagnostics()` in `sfu-client.service.ts` no longer contains an inline `for (const stat of stats.values()) { if (stat.type === 'media-source' ...` block — it calls the shared extractor instead. Grep:
  ```
  grep -n "media-source" frontend/src/app/services/sfu-client.service.ts
  ```
  must show the literal `'media-source'` string appearing in the SHARED extractor only (one definition site), not duplicated inside `collectDiagnostics`'s body. Exactly **one** `pc.getStats()`-fed extraction definition.

### U-6 — Extractor: no audio media-source present ⇒ null; partial fields ⇒ null per field
**Given** (a) a stats report with NO `media-source/audio` entry → returns `null`.
**Given** (b) a stats report with `{ type:'media-source', kind:'audio', audioLevel:0.2 }` (no `totalAudioEnergy`) → returns `{ audioLevel:0.2, totalAudioEnergy:null }`.
```
assert.strictEqual(extractOutboundAudioSource(noAudioStats), null);
assert.deepStrictEqual(extractOutboundAudioSource(partialStats), { audioLevel: 0.2, totalAudioEnergy: null });
```
> Mirrors the existing typeof-guard at sfu-client.service.ts:344-346 — non-number fields become `null`, never `undefined`/throw.

---

### --- AC3: CORE discriminator (SUSTAINED, LOCKED by JROM) ---

> **The locked rule**: SILENT iff `totalAudioEnergy` is FLAT across the window (max−min delta < epsilon) AND `audioLevel < threshold`. WORKING iff energy is INCREASING (delta ≥ epsilon) regardless of how low the instantaneous level is. NEVER decide on a single instantaneous `audioLevel` sample.

### U-7 — Flat energy + low level ⇒ SILENT (the bug we are catching)
**Given** a ~3s window of samples, all `totalAudioEnergy = 0.0001` (delta ≈ 0) and all `audioLevel = 0.003` (< 0.01)
**When** `classifyMicCapture(window)` is called
**Then** returns `'silent'`.
```
const window = Array.from({length:6}, () => ({ totalAudioEnergy: 0.0001, audioLevel: 0.003 }));
assert.strictEqual(classifyMicCapture(window), 'silent');
```

### U-8 — Increasing energy ⇒ WORKING even with low instantaneous level (quiet-but-working boundary)
**Given** a window where `totalAudioEnergy` grows monotonically by a TINY but nonzero amount each sample (e.g. `0.50, 0.51, 0.52, 0.53, 0.54, 0.55`) while `audioLevel` stays low (`0.004` each)
**When** `classifyMicCapture(window)` is called
**Then** returns `'working'` — a quiet-but-capturing mic must NOT be classed silent.
```
const window = [0.50,0.51,0.52,0.53,0.54,0.55].map(e => ({ totalAudioEnergy:e, audioLevel:0.004 }));
assert.strictEqual(classifyMicCapture(window), 'working');
```
> This is the LOCKED boundary case: cumulative energy still accumulating ⇒ working, even though every per-sample `audioLevel` is below the silence threshold.

### U-9 — Loud + rising energy ⇒ WORKING
**Given** energy `2.0, 4.1, 7.3, 11.0` and `audioLevel` `0.30` each
**Then** `'working'`.
```
const window = [2.0,4.1,7.3,11.0].map(e => ({ totalAudioEnergy:e, audioLevel:0.30 }));
assert.strictEqual(classifyMicCapture(window), 'working');
```

### U-10 — Flat energy but level ABOVE threshold ⇒ NOT silent (do not over-trigger)
**Given** flat energy (`5.0` each — corroboration fails) but `audioLevel = 0.4` (above threshold)
**Then** result is `'working'` (or `'unknown'`), NEVER `'silent'`. The level corroboration must prevent a false silent claim.
```
const window = Array.from({length:6}, () => ({ totalAudioEnergy: 5.0, audioLevel: 0.4 }));
assert.notStrictEqual(classifyMicCapture(window), 'silent');
```

### U-11 — Insufficient / null-field window ⇒ `unknown` (never a false silent claim)
**Given** (a) a window with fewer than the minimum samples (e.g. 1 sample) → `'unknown'`.
**Given** (b) a window where `totalAudioEnergy` is `null` on every sample → `'unknown'` (cannot prove flatness ⇒ no silence claim).
```
assert.strictEqual(classifyMicCapture([{ totalAudioEnergy:0.1, audioLevel:0.002 }]), 'unknown');
const nullWin = Array.from({length:6}, () => ({ totalAudioEnergy:null, audioLevel:0.002 }));
assert.strictEqual(classifyMicCapture(nullWin), 'unknown');
```
> Symmetry with mic-energy.ts's "graceful absence is not a silence claim." Recovery must NOT fire on `unknown` (see U-14).

---

### --- AC4 + AC5: Bounded NON-DESTRUCTIVE recovery decision (LOCKED) ---

### U-12 — Silent + enabled + unmuted + live + not-yet-attempted ⇒ reacquire SAME device
**Given** `decideMicRecovery({ classification:'silent', micEnabled:true, micUnmuted:true, hasLiveAudioTrack:true, alreadyAttempted:false, selectedDeviceId:'mic-abc-123' })`
**Then** `{ action:'reacquire-same-device', deviceId:'mic-abc-123' }`.
```
assert.deepStrictEqual(decideMicRecovery({classification:'silent',micEnabled:true,micUnmuted:true,hasLiveAudioTrack:true,alreadyAttempted:false,selectedDeviceId:'mic-abc-123'}),
  { action:'reacquire-same-device', deviceId:'mic-abc-123' });
```
**(AC5)** `deviceId` MUST equal the input `selectedDeviceId` — recovery does NOT switch the user's device.

### U-13 — Already attempted once ⇒ NO second attempt (one-shot bound)
**Given** the same SILENT input but `alreadyAttempted:true`
**Then** action is `'keep-and-warn'` (or `'none'`), NEVER `'reacquire-same-device'`.
```
const d = decideMicRecovery({classification:'silent',micEnabled:true,micUnmuted:true,hasLiveAudioTrack:true,alreadyAttempted:true,selectedDeviceId:'mic-abc-123'});
assert.notStrictEqual(d.action, 'reacquire-same-device');
```
> Proves the bound: at most ONE re-acquire per the gate's lifetime.

### U-14 — `working` or `unknown` classification ⇒ NO recovery (action 'none')
**Given** `classification:'working'` (all other fields recovery-eligible) → `{ action:'none' }`.
**Given** `classification:'unknown'` → `{ action:'none' }`.
```
assert.strictEqual(decideMicRecovery({classification:'working',micEnabled:true,micUnmuted:true,hasLiveAudioTrack:true,alreadyAttempted:false,selectedDeviceId:'m'}).action, 'none');
assert.strictEqual(decideMicRecovery({classification:'unknown',micEnabled:true,micUnmuted:true,hasLiveAudioTrack:true,alreadyAttempted:false,selectedDeviceId:'m'}).action, 'none');
```
> A quiet-but-working mic (U-8) classifies `working` ⇒ this predicate returns `none` ⇒ recovery never fires on it.

### U-15 — Gating: disabled OR muted OR no-live-track ⇒ NO recovery
**Given** SILENT classification but `micEnabled:false` → `action:'none'`.
**Given** SILENT but `micUnmuted:false` → `action:'none'`.
**Given** SILENT but `hasLiveAudioTrack:false` → `action:'none'`.
```
for (const over of [{micEnabled:false},{micUnmuted:false},{hasLiveAudioTrack:false}]) {
  const d = decideMicRecovery({classification:'silent',micEnabled:true,micUnmuted:true,hasLiveAudioTrack:true,alreadyAttempted:false,selectedDeviceId:'m',...over});
  assert.strictEqual(d.action, 'none', JSON.stringify(over));
}
```
> Matches the existing recovery-gate convention (room.page.ts:2135 — only act when in-call + current live track + enabled state holds). A muted user is intentionally silent and must never trigger a re-acquire.

### U-16 — Still-silent after the one attempt ⇒ KEEP-AND-WARN, never zero tracks
**Given** `decideMicRecovery({ classification:'silent', ..., alreadyAttempted:true, ... })` (the re-acquired track is ALSO silent)
**Then** `action === 'keep-and-warn'` — the decision NEVER yields a "stop track" / "remove track" / `reacquire` action on the second pass.
```
const d = decideMicRecovery({classification:'silent',micEnabled:true,micUnmuted:true,hasLiveAudioTrack:true,alreadyAttempted:true,selectedDeviceId:'mic-abc-123'});
assert.strictEqual(d.action, 'keep-and-warn');
```
**Non-destructive invariant (assert the absence of a destructive action):** the `RecoveryDecision.action` union contains NO value that stops/removes the track. `assert.ok(['reacquire-same-device','keep-and-warn','none'].includes(d.action))`. (Contrast: B2a must NOT reuse the destructive `removeAudioTrack()` path at room.page.ts:2215.)

### U-17 — Re-acquire always targets the selected device id (AC5, parametrized)
**Given** several `selectedDeviceId` values for a recovery-eligible SILENT input
**Then** the returned `deviceId` always equals the input `selectedDeviceId` (including `undefined` → reacquire system default, but NOT a different concrete id).
```
for (const id of ['mic-abc-123','usb-scarlett-2', undefined]) {
  const d = decideMicRecovery({classification:'silent',micEnabled:true,micUnmuted:true,hasLiveAudioTrack:true,alreadyAttempted:false,selectedDeviceId:id});
  if (d.action === 'reacquire-same-device') assert.strictEqual(d.deviceId, id);
}
```
> LOCKED: conservative recovery re-acquires the SAME device — it must never silently switch to a different concrete deviceId.

---

### --- Static / wiring assertions (code review, no second AudioContext) ---

### U-18 — No new AudioContext / AnalyserNode introduced by the energy gate
**Given** the B2a diff (sfu-client.service.ts, room.page.ts, and any new sibling module)
**Then** the energy gate reuses the getStats outbound-audio source — it introduces ZERO new `new AudioContext` / `AnalyserNode` instances.
**Verification** (grep — must show no NEW occurrences vs the 3c1ebff baseline; the only pre-existing `AudioContext` is the lobby preview meter in media.service.ts):
```
git diff 3c1ebff -- frontend/src/app | grep -nE "^\+.*(new AudioContext|AnalyserNode|createMediaStreamSource)"
```
must return NO added lines. The shared reader path uses `pc.getStats()` only.

### U-19 — Energy gate is hooked at the published block and is ONE-SHOT
**Given** room.page.ts around line 1313 (`if (state?.status === 'published')`)
**Then**:
- the energy gate is invoked from within / immediately after this published block (post-INITIAL-publish), not on every diagnostics tick.
- a one-shot guard (a boolean/flag, e.g. `micEnergyGateRan`) ensures it samples the window at most once per publish session.
**Verification**: code review — the gate call sits inside the publish success path (1310-1319 region) and is guarded so re-entry (e.g. reconnect re-publish) does not run it repeatedly within the same publish, consistent with `decideMicRecovery`'s `alreadyAttempted` bound. (Continuous mid-call polling is B2b — must NOT appear here.)

---

## Manual Smoke Scenarios (M-*) — localhost:4700 (NS5 forced-silent path)

Target: `http://localhost:4700` (PM2 `meet-poc-fe` + `meet-poc-be` up; `cd frontend && npm run build` then `pm2 restart meet-poc-fe`).
Per NS5, real mic capture cannot run headless — drive determinism with a **forced-silent track** (e.g. a `MediaStreamTrack` from a muted/oscillator-free source, a `WebAudio` silent oscillator at 0 gain, or DevTools override forcing the media-source `audioLevel`/`totalAudioEnergy` flat). The forced-silent path is a TEST harness only — it must not ship.

### M-1 — Healthy mic: gate runs once, classifies WORKING, no recovery, no warn
**Given** a 2-client room (host tab + guest incognito tab), host joins with a real working mic, mic unmuted, host speaks during the first ~3s after publish
**When** the post-publish energy gate samples its window
**Then**:
- the diagnostics sample shows `outboundAudioEnergy` INCREASING across samples and `micSilent:false`
- NO `deviceFailureNotice` appears (no "We can't detect sound…" banner)
- NO re-acquire occurs (mic device unchanged; no "Reconnecting…" actionNotice)
- audio is audible to the guest
**Screenshot**: diagnostics row(s) showing rising `outboundAudioEnergy` + `micSilent:false`, and the clean (no-notice) UI.

### M-2 — Forced-silent track: gate fires ONE recovery on SAME device, then KEEPS audio + warns
**Given** the host joins with the forced-silent audio track (enabled + unmuted + live, but flat `totalAudioEnergy`)
**When** the post-publish energy gate samples its ~3s window
**Then** (deterministic, the R3 core outcome):
1. classification = silent (flat energy + low level)
2. EXACTLY ONE re-acquire attempt fires, targeting the SAME `selectedAudioId` (verify in console/diagnostics log: device id unchanged; not a switch)
3. if the re-acquired track is ALSO silent (force it to stay silent), the app KEEPS the existing audio track — `localStream().getAudioTracks().length` stays ≥ 1 (NOT stopped/removed) — and sets `deviceFailureNotice` to the "We can't detect sound from your microphone…" copy
4. NO second re-acquire fires (bound respected) even though energy stays flat
**Assertions to observe**: audio track count never drops to 0; `deviceFailureNotice` is non-null with the expected copy; recovery counter == 1.
**Screenshot**: the `deviceFailureNotice` banner + a console/diagnostics line proving one attempt on the same device id + audio-track-count ≥ 1.

### M-3 — Muted host: no recovery (gating)
**Given** the host joins muted (track.enabled=false) or mutes before the gate window
**When** the gate window elapses
**Then** NO recovery fires and NO `deviceFailureNotice` appears — an intentionally muted user is never treated as a capture failure.
**Screenshot**: muted UI with no failure banner and no "Reconnecting…" notice.

---

## Edge Cases (explicitly covered above)
- Quiet-but-working mic (low level, rising energy) ⇒ WORKING, never recovered — U-8 (unit), M-1 (manual).
- Muted / disabled / no-live-track ⇒ never recovered — U-15, M-3.
- One-shot bound: never a second re-acquire — U-13, U-16, M-2 step 4.
- Non-destructive: still-silent KEEPS the track, sets the notice, never zero tracks — U-16, M-2 step 3.
- Same-device-only re-acquire (no silent device switch) — U-12, U-17, M-2 step 2.
- Graceful unknown (insufficient/null-field window) ⇒ never a false silent claim, no recovery — U-11, U-14.
- One source of truth: diagnostics + gate read the SAME extractor — U-5.
- No new AudioContext/meter — U-18.

## Out-of-Scope Reminder (NOT tested here)
- B2b: the in-call watchdog banner, the "Switch microphone" action, mid-call CONTINUOUS energy polling, and banner-clear-on-recovery.
- B3 diagnostics on/off toggle, B4 attribution/remote-audio surfacing, B5 self-test fidelity, B6 back-to-rooms.
- The pre-existing lobby `AnalyserNode` preview meter (must not regress, but not re-tested here).

---
---

# Scenarios: Batch 2b — In-call SUSTAINED silent-mic WATCHDOG + non-blocking "Switch microphone" banner (R2)

**Batch**: B2b (second half of B2; B2a landed @ b8fa5f7 and PASSED the gate — capture-side root-cause fix done)
**Requirement (verbatim)**: R2 — Silent-mic detection + actionable warning. When a participant's mic is enabled and unmuted but no audio energy is detected for a sustained window (uses R1's signal), the app warns them with a non-blocking, actionable prompt ('We can't detect sound from your microphone') and offers to switch microphone (opens the device picker). Clears when audio is detected.
**North-star anchors**: NS9 (root-cause/reuse R1's signal — NO new meter/AudioContext), NS5 (WebRTC mic can't be e2e'd headless ⇒ pure unit tests carry the proof + manual localhost:4700), NS4 (deferral OFF — the warn surface is unified in-batch, no double-warn shim).
**Branch**: feat/meet-diagnostics-audio-20260529 (B2b commits ON TOP of b8fa5f7)
**Written**: 2026-05-30
**Scope**: B2b ONLY. Reuses B2a's pure `classifyMicCapture()` + `getOutboundAudioSource()` + the `.device-notice` banner pattern. Does NOT re-open B2a's capture fix, does NOT touch B3/B4/B5/B6, SFU/transport, or auth.

## What B2b implements (the OUTCOMES these scenarios assert — NOT implementing here)

1. **CONTINUOUS in-call watchdog** — a NEW timer polling `sfuClient.getOutboundAudioSource()` every ~1s, keeping a rolling window of the last ~5-6 samples (~5s sustained window), classified via the EXISTING pure `classifyMicCapture()` from B2a (NO new meter/AudioContext). Runs ONLY in-call: starts at publish (alongside `startDiagnosticsLogger()` at room.page.ts:1337), stops in `cleanupCall()` (room.page.ts:1932). Distinct from the 7.5s diagnostics logger and the one-shot B2a gate — it needs its OWN ~1s interval to fill a ~5s window.
2. **Banner on sustained silence** — mic ENABLED + UNMUTED + `classifyMicCapture(window) === 'silent'` ⇒ a NEW dedicated `micSilentWarning` signal is set, rendering a NON-BLOCKING `.device-notice`-style banner with text exactly **"We can't detect sound from your microphone"** + a **"Switch microphone"** action button that calls `openInCallDeviceDialog()`. Banner is dismissible but primarily AUTO-CLEARS.
3. **Auto-clear** — `classifyMicCapture() === 'working'` (energy returns) ⇒ clear; mic muted/disabled ⇒ clear (don't warn about user-caused silence); `'indeterminate'` ⇒ NO change (no flicker).
4. **WARN-only** — the watchdog NEVER re-acquires/switches the device automatically (no mid-call auto-thrash). That is what distinguishes it from B2a's one-shot join-time recovery.
5. **UNIFY the warn surface** — B2a's post-publish one-shot still-silent fallback (room.page.ts:2294, currently `deviceFailureNotice`) is RE-POINTED to the SAME new `micSilentWarning` signal. ONE silent-mic warn surface; the watchdog's auto-clear covers both; no path shows two simultaneous silent-mic banners.

### Copy reconciliation (load-bearing — flag for implementer + reviewer)
B2a's existing fallback copy is the longer `"We can't detect sound from your microphone. Open devices to pick another."` (room.page.ts:2294, a Dismiss-only `.device-notice`). The R2 requirement + this batch lock the watchdog banner text to exactly **`"We can't detect sound from your microphone"`** WITH a **"Switch microphone"** action button (the action replaces the "Open devices to pick another." instruction sentence). On unify, **both** B2a's one-shot fallback and the watchdog drive `micSilentWarning` and render the SAME banner (exact text + action button). AC-B8's "one surface" assertion is checked against this single rendered banner; the exact-text assertion (AC-B2/AC-B5) targets the unified banner copy `"We can't detect sound from your microphone"`. If the impl keeps a trailing period or differs, the test report MUST quote the exact rendered string and the reviewer verifies it against the requirement copy.

## Pure-function contract under test (the AC-B1 headline)

The implementation MUST expose the warn-state transition as a framework-free, DOM-free PURE reducer so it is `tsx`-unit-testable (mirrors B2a's `mic-capture-health.spec.ts`). Name is guidance; assertions target observable input→output.

```ts
// NEW pure reducer in mic-energy.ts (or a sibling). No Angular, DOM, timers.
// current  = whether the silent-mic banner is currently shown (boolean)
// classification = classifyMicCapture(window) result for this poll
// micActive = mic is ENABLED && UNMUTED (the gate; muted/disabled ⇒ never warn)
// returns the NEXT banner-shown boolean.
nextMicWarningState(
  current: boolean,
  classification: 'silent' | 'working' | 'indeterminate',
  micActive: boolean,
): boolean
```

> Locked truth table (every transition pair):
> | micActive | classification | current | next | rationale |
> |-----------|----------------|---------|------|-----------|
> | false | (any) | false | **false** | muted/disabled ⇒ clear, never warn |
> | false | (any) | true | **false** | muting WHILE shown ⇒ clears (AC-B4) |
> | true | `silent` | false | **true** | sustained silence ⇒ show (AC-B2) |
> | true | `silent` | true | **true** | stays shown |
> | true | `working` | true | **false** | energy returned ⇒ auto-clear (AC-B3) |
> | true | `working` | false | **false** | stays clear |
> | true | `indeterminate` | true | **true** | unchanged — no flicker (AC-B3) |
> | true | `indeterminate` | false | **false** | unchanged — no flicker |

> Note `classifyMicCapture` returns the literal `'indeterminate'` (NOT `'unknown'`) per B2a's `MicCaptureClass`. The reducer must treat `'indeterminate'` as "keep current".

## Acceptance Criteria → Proof Map (Batch 2b)

| AC | What it asserts | Proof type | Scenarios |
|----|-----------------|-----------|-----------|
| AC-B1 | Pure reducer truth table: micActive=false⇒false; 'silent'⇒true; 'working'⇒false; 'indeterminate'⇒unchanged (all 8 transition pairs) | **Unit (pure)** | U-20..U-23 |
| AC-B2 | Window/sustained: flat energy + level<0.01 across the ~5s window ⇒ `classifyMicCapture`='silent' ⇒ banner shows; energy that rose anywhere (speech-then-pause) ⇒ 'working' ⇒ NO banner | **Unit (pure, reuses classify)** + Manual | U-24, U-25 + M-4 |
| AC-B3 | Auto-clear: banner shown, next poll energy returns ⇒ 'working' ⇒ clears WITHOUT user action; 'indeterminate' poll ⇒ no flicker | **Unit (pure)** + Manual | U-23, U-26 + M-5 |
| AC-B4 | Mute gating: muted/disabled ⇒ no banner even if silent; muting WHILE shown ⇒ clears | **Unit (pure)** + Manual | U-21, U-27 + M-6 |
| AC-B5 | Action: clicking "Switch microphone" calls `openInCallDeviceDialog()` ⇒ `inCallDeviceDialogOpen()===true`; the watchdog does NOT itself change the device | **Static/wiring** + Manual | U-28 + M-7 |
| AC-B6 | Non-blocking: banner is a `role="status"` `.device-notice`-style region, NOT a modal — does not trap focus / block call controls | **Static/wiring** + Manual | U-29 + M-7 |
| AC-B7 | Lifecycle: watchdog timer starts at publish, cleared in `cleanupCall()` — no leaked interval after leaving | **Static/wiring** + Manual | U-30, U-31 + M-8 |
| AC-B8 | Unify: ONE silent-mic warn surface — B2a's one-shot fallback AND the watchdog both drive `micSilentWarning`; no path shows two simultaneous silent-mic banners | **Static/wiring** + Manual | U-32 + M-7 |

**Unit-provable (deterministic, node/tsx):** AC-B1 (reducer, the headline) + AC-B2/AC-B3 classification half (over synthetic ~5s windows, reusing B2a's `classifyMicCapture`). These carry the proof per NS5.
**Static/wiring (code review + grep + build):** AC-B5 (action → `openInCallDeviceDialog`), AC-B6 (banner is `role="status"`, not modal), AC-B7 (start-at-publish / clear-in-cleanupCall, no leaked interval), AC-B8 (single `micSilentWarning` surface; B2a fallback re-pointed).
**Manual-only (live, localhost:4700, NS5):** the live banner appear-within-window / auto-clear-on-live-track behavior. The Playwright fake-media flag emits a TONE (always "working"), so headless CANNOT deterministically force a silent PUBLISHED track ⇒ the banner-appears path is carried as **MANUAL-PENDING localhost:4700** (M-4..M-8), NOT faked. A forced-silent track path (0-gain WebAudio oscillator track, or a DevTools override pinning the media-source `audioLevel`/`totalAudioEnergy` flat) drives M-4/M-5/M-6 deterministically; that harness must NOT ship.

---

## Unit Scenarios (U-*) — deterministic, node/tsx

**Run** (mirror B2a): `cd /home/agjrom/websites/meet-poc/frontend && npx tsx src/app/services/<spec>.spec.ts` using `import assert from 'node:assert/strict'` and a terminal `console.log('<module>: all assertions passed')`. Suggested spec file: `mic-silent-watchdog.spec.ts` (sibling of `mic-capture-health.spec.ts`). Build MUST stay green: `cd frontend && npm run build` (NS5).

### --- AC-B1: Pure warn-state reducer (the headline) ---

### U-20 — `silent` ⇒ show; `working` ⇒ clear (the core transitions, micActive=true)
**Given** `nextMicWarningState(current, classification, micActive=true)`
**Then**:
- `nextMicWarningState(false, 'silent', true)` === `true` (silence ⇒ show)
- `nextMicWarningState(true,  'silent', true)` === `true` (stays shown)
- `nextMicWarningState(true,  'working', true)` === `false` (energy returns ⇒ clear)
- `nextMicWarningState(false, 'working', true)` === `false` (stays clear)
```
assert.strictEqual(nextMicWarningState(false, 'silent',  true), true);
assert.strictEqual(nextMicWarningState(true,  'silent',  true), true);
assert.strictEqual(nextMicWarningState(true,  'working', true), false);
assert.strictEqual(nextMicWarningState(false, 'working', true), false);
```

### U-21 — micActive=false ⇒ ALWAYS false (mute gating, both current states)
**Given** the mic is muted/disabled (`micActive=false`)
**Then** the next state is `false` regardless of classification or current — including muting WHILE the banner is shown.
```
for (const klass of ['silent','working','indeterminate'] as const) {
  assert.strictEqual(nextMicWarningState(false, klass, false), false, `current=false ${klass}`);
  assert.strictEqual(nextMicWarningState(true,  klass, false), false, `current=true ${klass} (mute-while-shown clears)`);
}
```
> The `true,'silent',false` case is the explicit AC-B4 "muting while banner shown clears it" proof — a muted user is never warned about the silence they caused.

### U-22 — `indeterminate` ⇒ UNCHANGED (no flicker), micActive=true
**Given** an `'indeterminate'` poll (insufficient/null-field window — B2a returns this, NOT `'unknown'`)
**Then** the state equals `current` (no change, prevents flicker).
```
assert.strictEqual(nextMicWarningState(true,  'indeterminate', true), true);
assert.strictEqual(nextMicWarningState(false, 'indeterminate', true), false);
```

### U-23 — Auto-clear pair: shown→working clears WITHOUT user action
**Given** the banner is currently shown (`current=true`), mic active, and the next poll classifies `'working'`
**Then** `nextMicWarningState(true,'working',true) === false` — the reducer alone (driven by the next poll) clears it; no Dismiss click is required.
```
assert.strictEqual(nextMicWarningState(true, 'working', true), false);
```
> This is the AC-B3 auto-clear at the unit level: the transition is pure; the watchdog applying it each poll is the wiring (U-31).

### --- AC-B2 / AC-B3 classification half: window feeds the EXISTING classifier ---

> These reuse B2a's pure `classifyMicCapture()` UNCHANGED (assert the watchdog feeds it a correct rolling window). No new classifier.

### U-24 — FLAT energy + level<0.01 across the ~5s window ⇒ `'silent'` ⇒ banner shows
**Given** a 6-sample rolling window (~5s @ ~1s) all `totalAudioEnergy = 12.5` (flat, delta=0) and all `audioLevel = 0.004` (< 0.01)
**When** `classifyMicCapture(window)` then fed to the reducer with `micActive=true`
**Then** classification is `'silent'` and `nextMicWarningState(false,'silent',true)` is `true`.
```
const window = Array.from({length:6}, () => ({ totalAudioEnergy: 12.5, audioLevel: 0.004 }));
assert.strictEqual(classifyMicCapture(window), 'silent');
assert.strictEqual(nextMicWarningState(false, classifyMicCapture(window), true), true);
```

### U-25 — Energy ROSE anywhere in the window (speech-then-pause, DTX tolerance) ⇒ `'working'` ⇒ NO banner
**Given** a window where `totalAudioEnergy` rose at some point then went flat (e.g. `10.0, 10.0, 11.7, 12.4, 12.4, 12.4` — last−first ≥ epsilon) and `audioLevel` low (`0.003` each)
**When** classified + fed to the reducer
**Then** `'working'` ⇒ `nextMicWarningState(false,'working',true) === false` — a mic that spoke then paused must NOT be warned (DTX tolerance).
```
const window = [10.0,10.0,11.7,12.4,12.4,12.4].map(e => ({ totalAudioEnergy:e, audioLevel:0.003 }));
assert.strictEqual(classifyMicCapture(window), 'working');
assert.strictEqual(nextMicWarningState(false, classifyMicCapture(window), true), false);
```
> Cumulative `totalAudioEnergy` is monotonically non-decreasing; last−first ≥ epsilon proves SOME energy arrived in the window ⇒ working. This is the B2a-locked discriminator reused verbatim.

### U-26 — Auto-clear over a window sequence: silent-window then working-window
**Given** the watchdog state starts `false`; first window is the flat/silent one (U-24) ⇒ state→true; the NEXT window has rising energy (U-25-style) ⇒ classify `'working'`
**Then** applying the reducer across the two polls yields `true` then `false` — the banner cleared on its own when the working window arrived.
```
let shown = false;
shown = nextMicWarningState(shown, classifyMicCapture(silentWindow), true);  // -> true
assert.strictEqual(shown, true);
shown = nextMicWarningState(shown, classifyMicCapture(workingWindow), true); // -> false
assert.strictEqual(shown, false);
```

### U-27 — Mute mid-silence clears over a window sequence
**Given** state is `true` (banner shown from a silent window), then on the next poll the mic is muted (`micActive=false`) even though the window is still flat/silent
**Then** the reducer returns `false` — muting clears the banner regardless of the silent window.
```
let shown = nextMicWarningState(false, classifyMicCapture(silentWindow), true); // true
shown = nextMicWarningState(shown, classifyMicCapture(silentWindow), false);    // muted -> false
assert.strictEqual(shown, false);
```

### --- Static / wiring assertions (code review + grep + build) ---

> These cannot be node-asserted (they touch Angular signals / timers / template). Verified by code review + the grep commands below + a green `npm run build`. Each lists the SPECIFIC assertion the reviewer checks.

### U-28 — "Switch microphone" button calls `openInCallDeviceDialog`; watchdog never switches the device itself (AC-B5)
**Verification** (template + code review):
1. The `micSilentWarning` banner block in `room.page.html` contains a button bound to `openInCallDeviceDialog()` (NOT a direct `inCallDeviceDialogOpen.set(true)` and NOT any `replaceAudioTrack`/`changeAudioDevice` call). Grep:
   ```
   grep -nE "Switch microphone|openInCallDeviceDialog" frontend/src/app/pages/room/room.page.html
   ```
   must show the button label "Switch microphone" and a `(click)="openInCallDeviceDialog()"` binding in the `micSilentWarning` block.
2. The watchdog poll body (the new ~1s interval handler) contains NO `replaceAudioTrack` / `changeAudioDevice` / `recoverLocalAudioTrack` call — it ONLY reads `getOutboundAudioSource()`, classifies, and updates `micSilentWarning`. Grep the watchdog method body shows zero device-mutation calls. **The watchdog WARNS only — never auto-switches** (the B2b-vs-B2a distinction).
**Expected**: `openInCallDeviceDialog()` (room.page.ts:826) sets `inCallDeviceDialogOpen` to `true` and refreshes devices — clicking the action opens the EXISTING in-call picker; the watchdog itself leaves the device unchanged.

### U-29 — Banner is non-blocking `role="status"`, not a modal (AC-B6)
**Verification** (template + scss review):
- The `micSilentWarning` banner uses the `.device-notice` pattern: a `<div class="device-notice" role="status">` (or an equivalent non-modal status/alert region), rendered inline in the same `@if`-guarded notice stack as the existing `deviceFailureNotice` / `actionNotice` banners (room.page.html:188-198) — NOT inside `app-device-dialog` and NOT a full-screen overlay.
- `.device-notice` scss (room.page.scss:463) is inline flex with no `position:fixed`/overlay/backdrop and no focus-trap — call controls remain clickable. Grep:
  ```
  grep -nE "micSilentWarning" frontend/src/app/pages/room/room.page.html
  ```
  must show it inside the notice stack with `role="status"` (or `role="alert"`), reusing `.device-notice` styling.
**Expected**: identical non-blocking behavior to the existing `.device-notice` — a banner, never a modal trap.

### U-30 — Watchdog STARTS at publish, alongside the diagnostics logger (AC-B7)
**Verification** (code review):
- A `startMicSilentWatchdog()` (or equivalent) call is added at the publish/in-call entry — adjacent to `this.startDiagnosticsLogger();` (room.page.ts:1337) — so the watchdog arms only when in-call. It is NOT started in the lobby/preflight path.
- The watchdog uses its OWN interval at ~1s (NOT the 7.5s `DIAGNOSTICS_LOG_INTERVAL_MS` and NOT the one-shot B2a gate). Grep shows a new interval constant (e.g. `MIC_WATCHDOG_INTERVAL_MS ≈ 1000`) and a new timer field (e.g. `micWatchdogTimer`).
**Expected**: the watchdog's ~1s polling fills a ~5-6 sample (~5s) rolling window; it does not piggyback the coarse diagnostics tick.

### U-31 — Watchdog STOPS in `cleanupCall()` — no leaked interval (AC-B7)
**Verification** (code review):
- `cleanupCall()` (room.page.ts:1932-1945 region) calls `stopMicSilentWatchdog()` (or clears `micWatchdogTimer`), AND resets `micSilentWarning` to its cleared state (false/null) alongside the existing `this.deviceFailureNotice.set(null)` at room.page.ts:1972. After leaving, the interval handle is null and no further `getOutboundAudioSource()` polls fire. Grep:
  ```
  grep -nE "micWatchdogTimer|stopMicSilentWatchdog|micSilentWarning" frontend/src/app/pages/room/room.page.ts
  ```
  must show the timer cleared and `micSilentWarning` reset in `cleanupCall`'s body.
- The watchdog tick is a no-op (or self-stops) when `state() !== 'in-call'` (mirrors `startConnectionQualitySampler`'s in-call guard at room.page.ts:2446), so a stale tick can't warn after leaving.
**Expected**: leaving the call leaves ZERO leaked interval and a cleared banner — a fresh join re-arms cleanly.

### U-32 — ONE silent-mic warn surface: B2a fallback RE-POINTED to `micSilentWarning` (AC-B8, unify)
**Verification** (code review + grep):
- B2a's one-shot still-silent fallback at room.page.ts:2294 NO LONGER sets `deviceFailureNotice` with the silent-mic copy — it now sets the SAME `micSilentWarning` the watchdog uses. Grep:
  ```
  grep -nE "We can't detect sound from your microphone" frontend/src/app/pages/room/room.page.ts
  ```
  must show the silent-mic copy associated with `micSilentWarning` ONLY (one surface), NOT a `deviceFailureNotice.set("We can't detect sound…")` and a separate watchdog banner.
- The template renders the silent-mic banner from `micSilentWarning` in EXACTLY ONE `@if` block — there is no second simultaneous silent-mic `.device-notice`. (The unrelated `deviceFailureNotice` "No microphone available…" copy at room.page.ts:2231 is a DIFFERENT condition and may remain on its own banner — assert ONLY that the *silent-mic* warning has a single surface.)
- The watchdog's auto-clear (`'working'` ⇒ false) therefore also clears the warning that the B2a one-shot fallback raised — a returning mic clears BOTH origins via the one signal.
**Expected**: no double-warn; one `micSilentWarning` drives the single banner; both the one-shot fallback and the continuous watchdog feed it.

---

## Manual Smoke Scenarios (M-*) — localhost:4700 (NS5; MANUAL-PENDING for the live-banner path)

Target `http://localhost:4700` (PM2 `meet-poc-fe` + `meet-poc-be` up; `cd frontend && npm run build` then `pm2 restart meet-poc-fe`). Per NS5 the Playwright fake-media flag emits a TONE (always classifies `'working'`), so the banner-APPEARS path cannot be forced headless — drive it with a **forced-silent track** harness (0-gain WebAudio oscillator track published as the mic, or a DevTools override pinning the media-source `audioLevel`/`totalAudioEnergy` flat). The harness is test-only and must NOT ship. These are carried as **MANUAL-PENDING** in the test report — do NOT fake the headless result.

### M-4 — Sustained silence ⇒ banner appears within the ~5s window (AC-B2)
**Given** the host joins in-call with a forced-silent audio track (enabled + unmuted + live, flat `totalAudioEnergy`, `audioLevel<0.01`)
**When** the ~1s watchdog fills its ~5s rolling window and classifies `'silent'`
**Then** within ~5-6s a NON-BLOCKING banner appears reading exactly **"We can't detect sound from your microphone"** with a **"Switch microphone"** button; call controls remain usable behind it (no modal).
**Screenshot**: the banner (exact text + "Switch microphone" button) over a still-operable call UI.

### M-5 — Auto-clear: energy returns ⇒ banner disappears WITHOUT a click (AC-B3)
**Given** the banner is visible (from M-4), then swap the forced-silent track for the real working mic (or release the 0-gain override) so energy rises
**When** the next ~1s polls fill a window that classifies `'working'`
**Then** the banner CLEARS on its own (no Dismiss click) within ~1-2 polls; `'indeterminate'` interim polls cause NO flicker (it neither re-appears nor toggles).
**Screenshot**: before (banner) → after (banner gone) with no user interaction between.

### M-6 — Mute gating: muting clears / silence-while-muted never warns (AC-B4)
**Given** (a) host is muted (`track.enabled=false`) with a silent window ⇒ NO banner ever appears; (b) banner is showing from M-4, then host clicks mute ⇒ banner CLEARS.
**Then** an intentionally muted user is never warned; muting while shown dismisses it.
**Screenshot**: muted UI with no silent-mic banner (case a) and banner-gone-after-mute (case b).

### M-7 — Action + non-blocking + single surface (AC-B5/B6/B8)
**Given** the banner is visible (M-4)
**When** the host clicks **"Switch microphone"**
**Then** the EXISTING in-call device picker opens (`inCallDeviceDialogOpen` true; the `app-device-dialog` modal at room.page.html:157 appears) AND the watchdog did NOT itself change the device (selected device id unchanged until the user picks one in the dialog). Confirm only ONE silent-mic banner was ever shown (no double-warn from B2a's one-shot + the watchdog).
**Screenshot**: the device picker open after the click; the single banner before the click.

### M-8 — Lifecycle: no leaked watchdog after leaving (AC-B7)
**Given** the host is in-call with the watchdog running, then leaves the call (Leave button)
**When** back at rooms/lobby
**Then** the watchdog interval is cleared (no further `getOutboundAudioSource()` polls in console/network), the banner is gone, and rejoining re-arms a fresh watchdog. Verify in DevTools the interval count does not grow per leave/rejoin cycle.
**Screenshot/console**: console showing no post-leave watchdog polls + a clean rejoin.

---

## Edge Cases (explicitly covered)
- Speech-then-pause (DTX) ⇒ working, no banner — U-25 (unit), M-4 inverse.
- `'indeterminate'` (insufficient/null-field window) ⇒ no change, no flicker — U-22, U-26.
- Muting WHILE banner shown ⇒ clears — U-21, U-27, M-6b.
- Silence while muted ⇒ never warned — U-21, M-6a.
- Auto-clear without user action when energy returns — U-23, U-26, M-5.
- Watchdog warns only, never auto-switches the device — U-28, M-7.
- Single warn surface (B2a fallback re-pointed) — U-32, M-7.
- No leaked interval on leave/rejoin — U-31, M-8.
- No new AudioContext/meter (reuses `getOutboundAudioSource` + `classifyMicCapture`) — implied by U-28's "reads only" grep; reviewer also runs `git diff b8fa5f7 -- frontend/src | grep -nE "^\+.*(new AudioContext|AnalyserNode|createMediaStreamSource)"` ⇒ must return NO added lines.

## Out-of-Scope Reminder (NOT tested here)
- B2a's capture-side fix (constraints, extractor, recovery decision) — already gated @ b8fa5f7; NOT re-opened.
- B3 diagnostics on/off toggle, B4 attribution/remote-audio, B5 self-test fidelity, B6 back-to-rooms.
- SFU/transport, auth, and the pre-existing lobby `AnalyserNode` preview meter (must not regress, not re-tested).

STATUS: DONE
