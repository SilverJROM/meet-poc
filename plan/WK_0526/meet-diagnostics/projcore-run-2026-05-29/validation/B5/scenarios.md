# Scenarios: Batch B5 — Device self-test fidelity: no false pass (R8)

**Batch**: B5 (lobby/pre-call self-test fidelity; B1 @ 706813d/3c1ebff, B2a @ b8fa5f7, B2b @ 1ba17b5, B2c @ 4a50da2 all landed)
**Branch**: feat/meet-diagnostics-audio-20260529 (B5 commits ON TOP of 4a50da2)
**Written**: 2026-05-30
**Author**: [qa] — Mode 1 (scenario authoring only; no production code, no builds)

**Requirement (verbatim, R8)**: "The pre-call 'test/configure devices' mic check (lobby/preview) must measure the same capture path the call will publish — same selected device, same getUserMedia constraints, and the same published-audio-level signal used by diagnostics (R1) — so a microphone that will NOT transmit on the call cannot show as 'working' in the test. When no input energy is detected from the selected device for a sustained window, the test clearly flags it ('No sound detected from <device> — pick another') and warns the user before they join. The pre-call test result must match in-call reality."

**User report (verbatim, JROM / R8 / NS10)**: "perhaps one thing to add here or fix is to properly fix the self test on the user, if its truly not sending it should be flagged or can be flagged by the user on his test/configure devices, its unacceptable to pass that and yet when on a call it does not work perhaps we should look into fixing that as well"

**The bug being killed**: the US user's pre-call mic test showed "working" (a green/moving meter) but the call transmitted silence — a FALSE PASS. Root cause (confirmed below): the lobby/device-dialog meter is an **instantaneous single-frame** AnalyserNode RMS (`startMicLevel`, media.service.ts:186-204) with **no sustained window, no 'silent' verdict, and no flag** — so it never disagrees with in-call reality and can pass a mic that publishes silence.

**North-star anchors**:
- **NS10** (this batch — the pre-call self-test must match in-call reality; reuse the EXISTING `classifyMicCapture` + the same `0.01` threshold + the same `nextMicWarningState` reducer — NO new verdict logic, NO new meter/AudioContext).
- **NS9** (root-cause in OUR capture path: the lobby test must measure the SAME selected device + SAME `audioCaptureConstraints` the call publishes).
- **NS5** (WebRTC mic capture cannot be e2e'd headless; Chrome fake-media emits a **TONE on every fake input** ⇒ a fake mic ALWAYS classifies 'working' ⇒ a "silent" Playwright test is **impossible** ⇒ deterministic unit tests carry the proof + a MANUAL localhost:4700 close-out for the USER seat).
- **NS4** (deferral OFF — this slice finishes; no double-warn, no shim).

**Scope guards**: B5 / R8 ONLY. Touches: the lobby `app-lobby-preview` self-test surface, the lobby `app-device-dialog` (inline) VU panel, the cumulative-energy accumulator in `mic-energy.ts` + `media.service.startMicLevel`, and the lobby poller/flag signals in `room.page.ts`. Does **NOT** touch: the in-call B2a/B2b/B2c paths (`verifyInitialCaptureEnergy`, `pollMicSilenceWatchdog`, `runMicRecoverySweep`), the SFU/transport, layout, or B3/B4/B6. Does NOT re-open B2a's constraint builder or extractor (it REUSES them as the parity guard).

---

## Confirmed current state (grounding — file:line)

| Surface | Where | Behavior today | Why it false-passes |
|---|---|---|---|
| Lobby "Mic level" meter | lobby-preview.component.html:43 `<app-mic-meter [level]="level()" />` | renders `media.micLevel` | instantaneous only; no verdict |
| Device-dialog VU% + bar + meter | device-dialog.component.html:45-54 (`{{ levelLabel() }}%`, `[style.width]="levelPercent()"`, `<app-mic-meter [level]="level()" />`) | renders `media.micLevel` | instantaneous only; no verdict |
| Meter source | media.service.ts:186-204 `startMicLevel()` | single-frame `getByteTimeDomainData` RMS ×3 every 125ms; sets `micLevel` | **NO** sustained window, **NO** cumulative energy, **NO** 'silent' classification, **NO** flag → false pass |
| Acquire-path constraint parity | media.service.ts:352 `audioConstraints` → mic-energy.ts:47 `audioCaptureConstraints`; used by `preflight` (:60), `reacquire` (:79), `replaceAudioTrack` (:88) | all route through `audioCaptureConstraints(true, selectedAudioId)` | **ALREADY HOLDS post-B2a** — B5 ADDS a regression guard, it does not re-implement |
| In-call ground truth (the verdict to mirror) | mic-energy.ts:107-133 `classifyMicCapture` (sustained window) | flat cumulative energy + low level ⇒ `'silent'`; rising energy ⇒ `'working'`; <2 usable energy samples ⇒ `'indeterminate'` | the SAME function the lobby test must call |
| Reducer (the flag mapping) | mic-energy.ts:154-163 `nextMicWarningState(current, classification, micActive)` | `'silent'`⇒true, `'working'`⇒false, `'indeterminate'`⇒current, `micActive=false`⇒false | the SAME reducer the lobby flag must use |
| Silence threshold | mic-energy.ts:29 `MIC_SILENCE_LEVEL_THRESHOLD = 0.01` | level<0.01 corroborates flat-energy silence | the SAME `0.01` |
| Energy epsilon | mic-energy.ts:93 `ENERGY_DELTA_EPSILON = 1e-7` | last−first ≥ epsilon ⇒ 'working' | the SAME epsilon |
| Join button | room.page.html:495-501 `<button type="submit" class="primary-btn" [disabled]="state() === 'connecting'">` | only disabled while `connecting` | **MUST stay non-blocking** — B5 must NOT add a flag-bound `[disabled]` |
| In-call watchdog (the reference pattern, DO NOT touch) | room.page.ts:2547-2606 `pollMicSilenceWatchdog`, ~1s tick, window cap `MIC_SILENCE_WATCHDOG_WINDOW=6` | drives `micSilentWarning` via `classifyMicCapture`+`nextMicWarningState` | B5's lobby poller mirrors this shape on a SEPARATE `lobbySelfTestFlag` signal |

---

## What B5 implements (the OUTCOMES these scenarios assert — NOT implementing here)

The lobby self-test must become the SAME verdict the call would produce, fed off the SAME single AnalyserNode (no second meter/AudioContext). Per the design:

1. **Pure per-frame energy accumulator** added to `mic-energy.ts`: a function that maps a frame **mean-square** → an `EnergySample` `{ totalAudioEnergy: runningCumulative, audioLevel: rawRMS }` — i.e. a cumulative running total (monotone non-decreasing) plus the instantaneous level, so `classifyMicCapture` (which keys off the cumulative `totalAudioEnergy` delta) works identically to the in-call media-source-stat window.
2. **`media.service.startMicLevel`** additionally accumulates the cumulative energy + maintains a **bounded ~3s rolling `EnergySample` window**; exposes `getMicCaptureWindow()`; **resets** the accumulator/window on `stopMicLevel`. SAME single `AnalyserNode` — no new meter, no new `AudioContext`.
3. **`room.page.ts`**: a `lobbySelfTestFlag` signal + `selectedAudioLabel` (the human device name for the copy) + a **~1s lobby poller** gated on `audioContextActivated()` AND mic-on, that reads `media.getMicCaptureWindow()` → `classifyMicCapture(window)` → `nextMicWarningState(prior, classification, micActive)` → sets `lobbySelfTestFlag`. **Reset** on device change / join / leave.
4. **`room.page.html` + `lobby-preview` + `device-dialog`**: a **non-blocking** flag UI carrying the copy **"No sound detected from `<device>` — pick another"**, shown in BOTH the lobby preview and the lobby device-dialog before join. The Join button stays enabled.

### Copy Lock (load-bearing — flag for implementer + reviewer)
- **The flag string** is exactly **`No sound detected from <device> — pick another`** where `<device>` is the selected mic's `MediaDeviceInfo.label` (fallback to a generic `"this microphone"` when the label is empty/blank — labels are empty before the user grants permission). The literal substring **`No sound detected`** MUST appear in BOTH `lobby-preview.component.html` AND `device-dialog.component.html` (so the structural grep in T8 finds it in both).
- If the impl's rendered string differs, the test report MUST quote the EXACT rendered string and the reviewer verifies it against this lock. Non-negotiables: (a) it NAMES the device (or the generic fallback), (b) it is the SINGLE lobby self-test surface (no duplicate flicker between preview and dialog beyond the one shared `lobbySelfTestFlag` signal), (c) it is NON-blocking.

---

## Pure-function contracts under test (the deterministic proof per NS5)

The proof is UNIT level (`npx tsx src/app/services/<spec>.ts`, ESM `./mic-energy.js` specifier, `node:assert/strict` — mirrors B1/B2's `mic-energy.spec.ts` + `mic-capture-health.spec.ts`). The accumulator MUST be exposed as a framework-free, DOM-free, AudioContext-free, timer-free pure function so it is node/tsx-runnable. Names are guidance; assertions target observable input→output. (If the impl folds the accumulator into an existing export, that is fine — assert behavior; the test report maps the chosen export name.)

```ts
// PURE per-frame energy accumulator (NEW in mic-energy.ts). Maps a frame's
// mean-square (sum of centered-sample^2 / N — the SAME quantity startMicLevel
// already computes before sqrt) plus the prior cumulative total into the next
// EnergySample. totalAudioEnergy is a running cumulative (monotone non-decreasing
// over a frame stream); audioLevel is the instantaneous RMS (sqrt of mean-square,
// pre-×3-display-scale OR post — assert the documented choice, see U-1 note).
accumulateEnergyFrame(prevTotal: number, frameMeanSquare: number): EnergySample;
//   returns { totalAudioEnergy: prevTotal + frameMeanSquare, audioLevel: sqrt(frameMeanSquare) }

// REUSED unchanged (B1/B2a) — the verdict + reducer the lobby test must share:
classifyMicCapture(window: EnergySample[], opts?): 'silent' | 'working' | 'indeterminate';   // mic-energy.ts:107
nextMicWarningState(current: boolean, class: ..., micActive: boolean): boolean;               // mic-energy.ts:154
audioCaptureConstraints(audio: boolean, deviceId?: string): boolean | MediaTrackConstraints;  // mic-energy.ts:47
```

---

## Test strategy summary (per NS5)

| Layer | Tool | What it proves | Status |
|---|---|---|---|
| Pure accumulator | `npx tsx` unit (`mic-energy.spec.ts` extension or new `mic-selftest.spec.ts`) | silent frames ⇒ flat cumulative; quiet-working frames ⇒ strictly increasing | DETERMINISTIC — primary |
| Lobby classification mapping | same unit spec | silent window⇒'silent'⇒flag; rising⇒'working'⇒no-flag; muted⇒no-flag; thin⇒'indeterminate'⇒hold | DETERMINISTIC — primary |
| Constraint-parity guard (AC1) | same unit spec | lobby `audioCaptureConstraints(true,'dev-x')` deep-equals the call-path constraints object for the same deviceId | DETERMINISTIC — primary |
| Structural checks | `grep` | NO new `AudioContext`/`createAnalyser`; `"No sound detected"` in BOTH templates; Join button has NO flag-bound `[disabled]` | DETERMINISTIC — structural |
| Builds | `npm run build` (frontend) + backend build | green | gating |
| Real silent/working device | MANUAL localhost:4700 | flag in lobby + dialog before join; working mic ⇒ no flag AND call transmits; switch silent→working clears flag | **MANUAL-PENDING** (NS5 — headless cannot do this) |

**Explicit NS5 limitation (state in test report, do NOT fabricate)**: A fake-media Playwright "silent mic" test is **impossible** — Chrome's `--use-fake-device-for-media-stream` emits a continuous **tone** on every fake input, so the accumulator always sees rising energy and `classifyMicCapture` always returns `'working'`. The "false pass is now caught" behavior is therefore proven by the deterministic unit cases (which feed `classifyMicCapture` a hand-built FLAT-energy window) + the MANUAL real-device close-out. Do NOT write or claim a Playwright test that "shows the flag" — it cannot exist.

---

## SCENARIOS

> Every scenario lists: ID/Title, Roles, Preconditions, Type, Reference, Acceptance Criteria (concrete/assertable), Steps (Action → assertable Expected), Edge Cases, Verification. Every scenario maps to exactly one AC and to its proving unit case / structural check / manual note.

---

### U-1 — Accumulator: silent frames ⇒ FLAT cumulative energy
- **Roles**: n/a (pure function)
- **Preconditions**: `accumulateEnergyFrame` exported from `mic-energy.ts`
- **Type**: feature
- **Reference**: AC2; design step 1
- **Acceptance Criteria**: feeding a stream of zero-energy frames (`frameMeanSquare === 0`) yields a cumulative `totalAudioEnergy` whose last−first delta is `0` (`< ENERGY_DELTA_EPSILON`), and `audioLevel === 0` per frame.
- **Steps**:
  1. Action: `let s = {totalAudioEnergy:0,audioLevel:0}; for 5 frames: s = accumulateEnergyFrame(s.totalAudioEnergy, 0)` → Expected: every `s.totalAudioEnergy === 0`; the assembled window's `last.totalAudioEnergy - first.totalAudioEnergy === 0`; every `s.audioLevel === 0`.
  2. Action: assert the delta is `< ENERGY_DELTA_EPSILON` (1e-7) → Expected: `true` (this is precisely what makes `classifyMicCapture` see flatness).
- **Edge Cases**: a single tiny float-noise frame (`frameMeanSquare = 1e-12`) accumulates to a delta still `< 1e-7` ⇒ remains flat (float noise must not look like signal).
- **Verification**: reviewer confirms the accumulator does NOT reset between frames within a window and that delta-zero is asserted with `assert.ok(delta < ENERGY_DELTA_EPSILON)` (not `=== 0`, to allow the float-noise edge). **Proves AC2** (sustained window has a real flat-vs-rising signal to classify). **Unit case 1a.**

> **U-1 note for implementer**: document whether `audioLevel` in the accumulator is the raw RMS (`sqrt(meanSquare)`) or the display-scaled `min(1, sqrt(meanSquare)*3)`. The window's `audioLevel` feeds `classifyMicCapture`'s `0.01` threshold corroboration, so it MUST be the **raw RMS** (same units as the in-call media-source `audioLevel`), NOT the ×3 display value. The ×3 stays display-only on `micLevel`. The test asserts raw RMS.

---

### U-2 — Accumulator: quiet-but-working frames ⇒ STRICTLY INCREASING cumulative energy
- **Roles**: n/a (pure)
- **Preconditions**: `accumulateEnergyFrame` exported
- **Type**: feature (regression guard for U-8 "quiet-but-working never silent")
- **Reference**: AC2, AC3; design step 1
- **Acceptance Criteria**: feeding frames with a SMALL positive `frameMeanSquare` (e.g. `4e-6`, whose raw RMS `2e-3` is BELOW the `0.01` level threshold) yields a cumulative `totalAudioEnergy` that strictly increases each frame (last−first ≥ `ENERGY_DELTA_EPSILON`).
- **Steps**:
  1. Action: accumulate 5 frames of `frameMeanSquare = 4e-6` → Expected: `totalAudioEnergy` sequence is strictly increasing; `last - first ≈ 1.6e-5 ≥ 1e-7`.
  2. Action: assert each frame's `audioLevel ≈ 2e-3` and `< MIC_SILENCE_LEVEL_THRESHOLD (0.01)` → Expected: `true` (this is the quiet-but-working condition: rising energy DESPITE sub-threshold level).
- **Edge Cases**: alternating one zero frame between positive frames still nets a positive delta ⇒ still rising (a brief pause is not silence).
- **Verification**: reviewer confirms the test deliberately uses a sub-`0.01` level so it ALSO guards U-8 (the quiet mic). **Proves AC2 + the AC3 quiet-but-working half.** **Unit case 1b.**

---

### U-3 — Lobby classification: SILENT window ⇒ flag (the false-pass kill)
- **Roles**: n/a (pure, composing `classifyMicCapture` + `nextMicWarningState`)
- **Preconditions**: a hand-built FLAT-energy + sub-`0.01`-level window (the dead-mic shape)
- **Type**: feature (the headline — this is the case the old instantaneous meter could not produce)
- **Reference**: AC2, AC3, AC4; R8
- **Acceptance Criteria**: a window of `≥2` samples where `totalAudioEnergy` is flat (delta `< 1e-7`) and max `audioLevel < 0.01` ⇒ `classifyMicCapture(window) === 'silent'` ⇒ `nextMicWarningState(false, 'silent', true) === true` (flag raised).
- **Steps**:
  1. Action: `window = [{totalAudioEnergy:5,audioLevel:0.001},{totalAudioEnergy:5,audioLevel:0.002},{totalAudioEnergy:5,audioLevel:0.0}]` (flat cumulative, all levels < 0.01) → `classifyMicCapture(window)` → Expected: `'silent'`.
  2. Action: `nextMicWarningState(false, 'silent', true)` → Expected: `true` (flag shown).
  3. Action: confirm this uses the SAME `0.01` threshold by asserting a window with the SAME flat energy but one `audioLevel = 0.02` (above 0.01) → `classifyMicCapture` → Expected: `'working'` (NOT silent — corroboration boundary identical to in-call).
- **Edge Cases**: flat energy with a single above-threshold level spike ⇒ NOT silent (matches mic-energy.ts:124-132 corroboration). Documented so the impl can't "fix" the false pass by ignoring the level corroboration.
- **Verification**: reviewer confirms the lobby path calls the EXACT SAME `classifyMicCapture` import (no shadow copy) and the EXACT SAME `nextMicWarningState`. **Proves AC2 + AC3 (flag half) + AC4 (same verdict/threshold/reducer as in-call).** **Unit case 2a.**

---

### U-4 — Lobby classification: RISING-energy window ⇒ NO flag (U-8 preserved)
- **Roles**: n/a (pure)
- **Preconditions**: a rising-cumulative window with sub-`0.01` levels (quiet-but-working)
- **Type**: regression (the false-NEGATIVE guard — a working quiet mic must not be flagged)
- **Reference**: AC3
- **Acceptance Criteria**: a window where `totalAudioEnergy` rises (last−first ≥ `1e-7`) ⇒ `classifyMicCapture === 'working'` ⇒ `nextMicWarningState(false, 'working', true) === false` (no flag), EVEN when every `audioLevel < 0.01`.
- **Steps**:
  1. Action: `window = [{totalAudioEnergy:1,audioLevel:0.001},{totalAudioEnergy:1.0001,audioLevel:0.002},{totalAudioEnergy:1.0003,audioLevel:0.001}]` → `classifyMicCapture` → Expected: `'working'`.
  2. Action: `nextMicWarningState(false, 'working', true)` → Expected: `false` (no flag).
  3. Action: a shown flag that then sees a working window: `nextMicWarningState(true, 'working', true)` → Expected: `false` (auto-clears when the user picks a working device — supports AC5 clear-on-fix).
- **Edge Cases**: a previously-flagged state auto-clears WITHOUT user action when energy returns (e.g. the user just started speaking) — no stuck flag.
- **Verification**: reviewer confirms the quiet-but-working case is asserted with sub-threshold levels (proves the lobby test does NOT regress to a level-only check). **Proves AC3 (no-flag half, U-8) + AC5 (clear-on-fix).** **Unit case 2b.**

---

### U-5 — Lobby classification: micActive=false (mic off / muted in lobby) ⇒ NO flag
- **Roles**: n/a (pure)
- **Preconditions**: lobby with the "Mic off" toggle (room.page.html `microphoneRequested()` false) OR no live audio track
- **Type**: feature (gating — a user who turned the mic off in the lobby must not be told "no sound detected")
- **Reference**: AC4, AC6
- **Acceptance Criteria**: regardless of classification, `nextMicWarningState(current, classification, /*micActive=*/false) === false`.
- **Steps**:
  1. Action: `nextMicWarningState(false, 'silent', false)` → Expected: `false` (a silent window while mic is OFF never flags).
  2. Action: `nextMicWarningState(true, 'silent', false)` → Expected: `false` (a shown flag clears the moment the mic is toggled off).
- **Edge Cases**: toggling mic off WHILE the flag is shown clears it (matches the in-call reducer's mute-clears behavior, mic-energy.ts:159).
- **Verification**: reviewer confirms the lobby poller computes `micActive` from the lobby mic-on signal + a live audio track (NOT just "audio context active"). **Proves AC4 (same reducer gating as in-call).** **Unit case 2c.**

---

### U-6 — Lobby classification: THIN window (<2 usable energy samples) ⇒ indeterminate ⇒ HOLD (no flicker on first poll)
- **Roles**: n/a (pure)
- **Preconditions**: the very first ~1s poll, before the ~3s window has filled (≥2 usable cumulative samples)
- **Type**: feature (anti-flicker — AC6, the premature-flag guard)
- **Reference**: AC6
- **Acceptance Criteria**: a window with `<2` non-null `totalAudioEnergy` samples ⇒ `classifyMicCapture === 'indeterminate'` ⇒ `nextMicWarningState(prior, 'indeterminate', true) === prior` (unchanged) — so a not-yet-warned lobby stays unflagged on the first poll.
- **Steps**:
  1. Action: `classifyMicCapture([{totalAudioEnergy:0,audioLevel:0}])` (1 sample) → Expected: `'indeterminate'`.
  2. Action: `classifyMicCapture([{totalAudioEnergy:null,audioLevel:null},{totalAudioEnergy:null,audioLevel:0.0}])` (0 usable energies) → Expected: `'indeterminate'`.
  3. Action: `nextMicWarningState(false, 'indeterminate', true)` → Expected: `false` (no premature flag).
  4. Action: `nextMicWarningState(true, 'indeterminate', true)` → Expected: `true` (a real prior flag is NOT erased by a transient thin window).
- **Edge Cases**: the window fills mid-poll — once `≥2` usable samples arrive, the next poll classifies for real. No flag is asserted UNTIL a genuine 'silent' window.
- **Verification**: reviewer confirms the poller never raises the flag on the first tick (the ~3s window cannot have ≥2 samples after one ~1s poll unless the accumulator pre-seeded — see U-7). **Proves AC6.** **Unit case 2d.**

---

### U-7 — Window discipline: poller reads a SUSTAINED ~3s window, not a single frame
- **Roles**: n/a (pure / structural)
- **Preconditions**: `media.getMicCaptureWindow()` returns the bounded rolling `EnergySample[]`
- **Type**: feature (proves the fix is sustained, not instantaneous — directly kills the root cause)
- **Reference**: AC2
- **Acceptance Criteria**: the window is BOUNDED (does not grow unbounded), is reset on `stopMicLevel`, and contains cumulative `EnergySample`s (not one-frame snapshots). The poller passes the WHOLE window to `classifyMicCapture`, never a single sample.
- **Steps**:
  1. Action (structural): grep the lobby poller body in `room.page.ts` for `classifyMicCapture(` and confirm its argument is `media.getMicCaptureWindow()` (or the bound window var), NOT a single `{...}` literal → Expected: window argument present.
  2. Action (structural): grep `getMicCaptureWindow` is defined in `media.service.ts` and the window array is `.shift()`-capped (bounded) and emptied in `stopMicLevel` (reset on device change/leave) → Expected: bounded + reset present.
- **Edge Cases**: device change resets the window so stale energy from the previous mic can't bleed into the new device's verdict (mirrors the watchdog's `micSilenceWindow = []` reset).
- **Verification**: reviewer confirms the window is the SAME single-AnalyserNode source as `micLevel` (no second analyser — see T7). **Proves AC2 (sustained, not one-frame).** **Structural check (grep) + supported by unit cases 1a/1b/2a.**

---

### U-8 — Constraint parity: lobby self-test constraints DEEP-EQUAL the call-path constraints (AC1 regression guard)
- **Roles**: n/a (pure)
- **Preconditions**: `audioCaptureConstraints` exported (mic-energy.ts:47); `media.service` delegates via `audioConstraints` (media.service.ts:352)
- **Type**: regression (parity already holds post-B2a; B5 ADDS the guard so a future edit can't silently diverge the test path from the publish path)
- **Reference**: AC1; R8 "same selected device, same getUserMedia constraints"
- **Acceptance Criteria**: `audioCaptureConstraints(true, 'dev-x')` deep-equals the constraints object the call path builds for the SAME `deviceId`, i.e.:
  ```ts
  { echoCancellation:{ideal:true}, noiseSuppression:{ideal:true}, autoGainControl:{ideal:true}, deviceId:{exact:'dev-x'} }
  ```
- **Steps**:
  1. Action: `assert.deepEqual(audioCaptureConstraints(true,'dev-x'), {echoCancellation:{ideal:true}, noiseSuppression:{ideal:true}, autoGainControl:{ideal:true}, deviceId:{exact:'dev-x'}})` → Expected: pass.
  2. Action: no-device parity — `audioCaptureConstraints(true)` ⇒ same EC/NS/AGC `{ideal:true}` and NO `deviceId` key → Expected: deep-equal `{echoCancellation:{ideal:true}, noiseSuppression:{ideal:true}, autoGainControl:{ideal:true}}`.
  3. Action (structural): grep confirms the lobby preflight/preview path uses `selectedAudioId()` as the deviceId (room.page.ts:1868 `preflight({audio:true, ..., audioDeviceId: this.selectedAudioId() || undefined})`) — the SAME id the call publishes (room.page.ts:1754/1782) → Expected: same `selectedAudioId()` source.
- **Edge Cases**: empty-string `selectedAudioId` ⇒ `undefined` ⇒ no `deviceId:{exact:''}` (the `|| undefined` guard) — the test asserts no `{exact:''}` is ever produced (matches mic-energy.ts:53 `deviceId ? ... : {}`).
- **Verification**: reviewer confirms there is ONE constraint builder (`audioCaptureConstraints`) and the lobby test does NOT construct its own constraints object. This is the "test path == publish path" guard. **Proves AC1.** **Unit case 3.**

---

### U-9 — Non-blocking: Join button has NO flag-bound disable
- **Roles**: USER (lobby)
- **Preconditions**: lobby rendered; `lobbySelfTestFlag()` may be true or false
- **Type**: feature (R8 "warns the user before they join" — a flag, NOT a block)
- **Reference**: AC5
- **Acceptance Criteria**: the Join `<button type="submit" class="primary-btn">` (room.page.html:495-501) keeps `[disabled]="state() === 'connecting'"` and gains NO `lobbySelfTestFlag`-bound disable. A user with a flagged mic can still join.
- **Steps**:
  1. Action (structural): grep the Join button block in `room.page.html` — its `[disabled]` binding is exactly `state() === 'connecting'` with NO reference to `lobbySelfTestFlag` / `selfTest` / `micSilent` in the `[disabled]` expression → Expected: no flag in the disable.
  2. Action (manual close-out, see M-1): with the flag shown, the Join button is clickable and join proceeds.
- **Edge Cases**: the flag and a name-required error can coexist; only the existing name validation (not the flag) governs the submit's effective gating.
- **Verification**: reviewer greps the disable binding and confirms it is unchanged from `state() === 'connecting'`. **Proves AC5 (non-blocking).** **Structural check (grep) + M-1 manual.**

---

### U-10 — Flag copy present in BOTH lobby surfaces; NO new AudioContext/AnalyserNode
- **Roles**: n/a (structural)
- **Preconditions**: B5 templates + media.service edited
- **Type**: feature (Copy Lock + single-analyser invariant)
- **Reference**: AC3 (unmissable flag), NS10 (no new meter)
- **Acceptance Criteria**:
  - the literal substring **`No sound detected`** appears in BOTH `lobby-preview.component.html` AND `device-dialog.component.html`;
  - NO new `new AudioContext` / `createAnalyser` / `webkitAudioContext` is introduced by B5 (the accumulator reuses the SINGLE existing analyser in `startMicLevel`, media.service.ts:189).
- **Steps**:
  1. Action: `grep -rn "No sound detected" frontend/src/app/components/lobby-preview/ frontend/src/app/components/device-dialog/` → Expected: ≥1 hit in EACH directory.
  2. Action: `git diff 4a50da2 -- frontend/src/app/services/media.service.ts` shows NO added `createAnalyser`/`new AudioContext` (count of these in the diff's added lines == 0; the existing single `createAnalyser` at line 189 is unchanged) → Expected: 0 added analyser/context constructions.
- **Edge Cases**: an em-dash vs hyphen mismatch in the copy — the grep targets the stable substring `No sound detected` (before the `<device>`), avoiding dash ambiguity; the FULL string is verified against the Copy Lock by the reviewer reading the rendered template.
- **Verification**: reviewer confirms the flag is wired off the ONE `lobbySelfTestFlag` signal into both templates (no second poller/analyser). **Proves AC3 (unmissable, both surfaces) + the no-new-meter invariant.** **Structural check (grep + git diff).**

---

### U-11 — No-regression: B1/B2a/B2b/B2c unit specs stay green
- **Roles**: n/a
- **Preconditions**: existing specs `mic-energy.spec.ts`, `mic-capture-health.spec.ts`, `mic-sweep.spec.ts`
- **Type**: regression
- **Reference**: scope guard (B5 must not touch in-call paths or the existing pure functions' behavior)
- **Acceptance Criteria**: all three existing specs still print "all assertions passed" after B5. `classifyMicCapture`, `nextMicWarningState`, `audioCaptureConstraints`, the sweep functions, and `deriveOutboundAudioFields` are UNCHANGED in behavior (B5 only ADDS the accumulator + lobby wiring).
- **Steps**:
  1. Action: `cd frontend && npx tsx src/app/services/mic-energy.spec.ts` → Expected: "mic-energy: all assertions passed".
  2. Action: `npx tsx src/app/services/mic-capture-health.spec.ts` → Expected: "all assertions passed".
  3. Action: `npx tsx src/app/services/mic-sweep.spec.ts` → Expected: all pass.
- **Edge Cases**: if the accumulator is added to `mic-energy.ts`, the existing `mic-energy.spec.ts` imports must still resolve (new export must not break the file).
- **Verification**: reviewer re-runs all three independently. **Proves scope containment.** **Unit (regression).**

---

### M-1 — MANUAL: real dead/silent device flags in BOTH lobby surfaces before join (USER seat)
- **Roles**: USER (real browser, localhost:4700)
- **Preconditions**: a real mic that enumerates but transmits no energy (OS-mixer-muted input, dead/unplugged-but-still-listed USB, or a wrong-channel device); NS5 — CANNOT be headless (fake-media tones every input)
- **Type**: feature (the end-to-end fidelity proof)
- **Reference**: AC2, AC3, AC4; R8
- **Acceptance Criteria**: with the dead device selected, after the ~3s sustained window the lobby preview AND the lobby device-dialog show **"No sound detected from `<device>` — pick another"** with the real device label; the flag appears BEFORE join; the Join button stays enabled.
- **Steps**:
  1. Action: open `http://localhost:4700/<room>` lobby, grant mic, select the dead device → Expected: meter stays flat; within ~3-4s the flag appears in the preview.
  2. Action: open "Test / configure devices" (lobby device-dialog) → Expected: the SAME flag appears there too; the VU% reads ~0.
  3. Action: screenshot both surfaces showing the flag + the device name.
- **Edge Cases**: a device that produces a tiny hum below `0.01` but with truly flat energy still flags (matches U-3).
- **Verification**: MANUAL-PENDING — JROM/USER seat. Test report marks this MANUAL-PENDING with a note that NS5 makes it un-headless-able; attach screenshots when run. **Proves AC2/AC3/AC4 end-to-end.**

---

### M-2 — MANUAL: real WORKING mic ⇒ no flag, AND the call then transmits audio (consistency)
- **Roles**: USER (two real browsers / two seats), localhost:4700
- **Preconditions**: a real working mic; a second participant to confirm received audio
- **Type**: feature (the "pre-call result matches in-call reality" proof — the core of R8)
- **Reference**: AC4; R8 "the pre-call test result must match in-call reality"
- **Acceptance Criteria**: with a working mic, the lobby self-test shows NO flag; the user joins; the second participant HEARS the audio (in-call reality == lobby verdict). No false pass AND no false flag.
- **Steps**:
  1. Action: lobby with a real working mic, speak → Expected: no flag in preview or dialog; meter moves.
  2. Action: join; have the second seat confirm they hear the speaker → Expected: audio received (consistency).
- **Edge Cases**: a quiet speaker (soft voice, low gain) must NOT be flagged in the lobby (U-8 / U-4 real-world counterpart).
- **Verification**: MANUAL-PENDING — JROM/USER seat. **Proves AC4 consistency end-to-end.**

---

### M-3 — MANUAL: switching silent→working device CLEARS the flag (clear-on-fix)
- **Roles**: USER, localhost:4700
- **Preconditions**: at least two mics — one dead, one working
- **Type**: feature
- **Reference**: AC5
- **Acceptance Criteria**: a shown flag (dead device selected) clears within ~3s of selecting the working device in the lobby mic dropdown; the window resets on device change so no stale flag persists.
- **Steps**:
  1. Action: select the dead device → Expected: flag appears (per M-1).
  2. Action: switch the lobby Microphone dropdown to the working device, speak → Expected: flag clears within ~one window (~3s); meter moves.
- **Edge Cases**: rapid back-and-forth device switching does not leave a stuck flag (window reset on each change).
- **Verification**: MANUAL-PENDING — JROM/USER seat. **Proves AC5 (clear-on-fix) end-to-end.**

---

## Scenario → AC → proof mapping

| Scenario | Proves AC | Proof mechanism | Concrete assertion |
|---|---|---|---|
| U-1 | AC2 | unit 1a | silent frames ⇒ `last-first delta < ENERGY_DELTA_EPSILON (1e-7)`; `audioLevel===0` |
| U-2 | AC2, AC3 (quiet-working) | unit 1b | `frameMeanSquare=4e-6` ⇒ cumulative strictly increasing, `last-first ≥ 1e-7`; `audioLevel≈2e-3 < 0.01` |
| U-3 | AC2, AC3 (flag), AC4 | unit 2a | flat-energy + sub-0.01 window ⇒ `classifyMicCapture==='silent'`; `nextMicWarningState(false,'silent',true)===true`; one above-0.01 level ⇒ `'working'` (threshold boundary == in-call) |
| U-4 | AC3 (no-flag), AC5 | unit 2b | rising-energy sub-0.01 window ⇒ `'working'`; `nextMicWarningState(false,'working',true)===false`; `(true,'working',true)===false` |
| U-5 | AC4 (mute gating) | unit 2c | `nextMicWarningState(*, *, false)===false` for `(false,'silent',false)` and `(true,'silent',false)` |
| U-6 | AC6 | unit 2d | `<2` usable energies ⇒ `'indeterminate'`; `nextMicWarningState(false,'indeterminate',true)===false`; `(true,...)===true` |
| U-7 | AC2 (sustained) | grep + unit 1a/1b/2a | poller passes `getMicCaptureWindow()` (bounded, reset) to `classifyMicCapture`, never a single sample |
| U-8 | AC1 | unit 3 | `audioCaptureConstraints(true,'dev-x')` deep-equals the call-path object; no-device ⇒ no `deviceId` key; never `{exact:''}` |
| U-9 | AC5 (non-blocking) | grep + M-1 | Join `[disabled]` is exactly `state() === 'connecting'`, no flag reference |
| U-10 | AC3 (both surfaces), no-new-meter | grep + git diff | `No sound detected` in BOTH templates; 0 added `createAnalyser`/`new AudioContext` |
| U-11 | scope containment | unit regression | mic-energy + mic-capture-health + mic-sweep specs all "all assertions passed" |
| M-1 | AC2, AC3, AC4 | MANUAL-PENDING | real dead device ⇒ flag in preview + dialog with device label, before join, Join enabled |
| M-2 | AC4 (consistency) | MANUAL-PENDING | real working mic ⇒ no flag AND second seat hears audio |
| M-3 | AC5 (clear-on-fix) | MANUAL-PENDING | switch silent→working ⇒ flag clears within ~one window |

## AC → scenario coverage (completeness check)

| AC | Covered by |
|---|---|
| AC1 — same device + same `audioCaptureConstraints` as call (parity guard) | **U-8** (+ U-7 device-id source grep) |
| AC2 — SUSTAINED window via `classifyMicCapture`, not one-frame | **U-1, U-2, U-3, U-7** + M-1 |
| AC3 — no-energy mic FLAGGED ("No sound detected from `<device>`"); quiet-working NOT flagged (U-8 preserved) | **U-3, U-4, U-10** + M-1 |
| AC4 — verdict matches in-call (same `classifyMicCapture` + `0.01` + `nextMicWarningState`) | **U-3, U-5** + M-2 |
| AC5 — non-blocking; failure unmissable; working device clears flag | **U-4 (clear), U-9 (non-block), U-10 (unmissable)** + M-3 |
| AC6 — no premature flag while window fills (`<2` samples ⇒ indeterminate ⇒ hold) | **U-6** |

## Scenario-to-E2E mapping (test-name contract)

Per the QA scenario-to-E2E rule, every unit test name starts with its scenario ID. The B5 spec (`mic-selftest.spec.ts` or appended to `mic-energy.spec.ts`) MUST carry these labelled blocks:

```
// U-1 — accumulator: silent frames ⇒ flat cumulative
// U-2 — accumulator: quiet-but-working ⇒ strictly increasing
// U-3 — lobby SILENT window ⇒ flag (false-pass kill)
// U-4 — lobby RISING window ⇒ no flag (U-8 preserved) + clear-on-fix
// U-5 — micActive=false ⇒ no flag (mute gating)
// U-6 — thin window ⇒ indeterminate ⇒ hold (anti-flicker, AC6)
// U-8 — constraint parity deep-equal (AC1 guard)
```
U-7, U-9, U-10 are structural (grep/git-diff, recorded in the test report, not test blocks). U-11 is the regression re-run. M-1..M-3 are MANUAL-PENDING.

---

## Notes for implementer (load-bearing constraints)

1. **REUSE, do not re-implement**: `classifyMicCapture`, `nextMicWarningState`, `MIC_SILENCE_LEVEL_THRESHOLD`, `ENERGY_DELTA_EPSILON`, `audioCaptureConstraints` — import the EXACT in-call functions. A shadow copy is a REJECT (it would let the lobby verdict drift from in-call reality, re-opening the exact R8 bug).
2. **ONE analyser**: the accumulator hangs off the single existing `AnalyserNode` in `startMicLevel` (media.service.ts:189). NO new `AudioContext`/`createAnalyser` (T10/U-10 fails the batch otherwise).
3. **Raw RMS in the window**: the window's `audioLevel` MUST be the raw RMS (sqrt of mean-square), same units as the in-call media-source `audioLevel` — the `×3` stays display-only on `micLevel` (U-1 note).
4. **Reset on device change / leave**: clear the accumulator + window when the device changes or the lobby tears down (mirrors `micSilenceWindow = []`), so a stale verdict never bleeds across devices (U-7, M-3).
5. **Non-blocking Join**: do NOT add a `lobbySelfTestFlag`-bound `[disabled]` to the Join button (U-9).
6. **Copy Lock**: `No sound detected from <device> — pick another`, substring `No sound detected` in BOTH templates; generic `"this microphone"` fallback for empty labels.
7. **NS5**: do NOT write a fake-media Playwright "silent" test — it cannot exist (fake inputs tone). The proof is the unit cases + MANUAL M-1..M-3.

STATUS: DONE
