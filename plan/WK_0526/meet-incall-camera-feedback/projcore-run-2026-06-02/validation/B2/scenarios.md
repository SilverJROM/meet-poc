# Scenarios: Batch B2 — Same-room feedback suppression (SUPPRESSION ONLY)

Scope (locked by JROM): maximize software suppression on the audio path. **NO** detection UI, **NO** auto-mute, **NO** warning banner. Three surgical files:
- `frontend/src/app/services/mic-energy.ts` — keep capture constraints graceful `{ideal:true}`; ADD pure `unappliedAudioProcessing(settings)`.
- `frontend/src/app/services/media.service.ts` — ONE log-only verifier call at the audio-acquire chokepoint (zero behavior change).
- `frontend/src/app/services/remote-audio.service.ts` — insert a `DynamicsCompressorNode` limiter (source→gain→limiter→destination); `FEEDBACK_LIMITER_PARAMS`; `reset()` disconnects it.

Pure-logic specs run via `npx tsx <spec>` from `frontend/`. Build via `npx ng build` from `frontend/`. Deploy = DEV build + `pm2 restart meet-poc-fe`.

Flag legend: **[tsx-unit]** pure node:assert spec · **[build]** compiles/typechecks · **[manual-localhost]** single-machine browser observation · **[live-two-device]** JROM two-device same-room test.

---

## RF1-S1: audioCaptureConstraints requests EC+NS+AGC gracefully on every path  **[tsx-unit]**
**Type:** regression (guards the locked capture chokepoint while B2 touches the same file)

### Acceptance Criteria (inputs → exact outputs)
`audioCaptureConstraints` is the SINGLE audio-capture constraints builder (RF1: single chokepoint). For `audioCaptureConstraints(true)` the returned object MUST be:
- `echoCancellation` deep-equals `{ ideal: true }`
- `noiseSuppression` deep-equals `{ ideal: true }`
- `autoGainControl` deep-equals `{ ideal: true }`
- NO key on any of those three uses `exact` (graceful: no `{exact}` that hard-fails). Assert `'exact' in (result.echoCancellation as object) === false` for all three.
- `audioCaptureConstraints(true, 'dev-123')` adds `deviceId` deep-equals `{ exact: 'dev-123' }` AND still keeps the three processing fields as `{ ideal: true }`.
- `audioCaptureConstraints(false)` strictly equals boolean `false`.
- `audioCaptureConstraints(true)` has NO `deviceId` key (`'deviceId' in result === false`).

### Steps
1. From `frontend/`, run `npx tsx src/app/services/mic-energy.spec.ts` (existing) plus the new B2 spec.
2. Assert each criterion above with `assert.deepStrictEqual` / `assert.strictEqual`.

### Edge Cases
- `audioCaptureConstraints(true, undefined)` MUST NOT emit `deviceId:{exact:undefined}` — assert `'deviceId' in result === false`.
- `audioCaptureConstraints(true, '')` (empty string is falsy) MUST NOT add deviceId.

### Verification (how reviewer checks)
Run the spec; expect `all assertions passed`, exit 0. Grep the diff to confirm the three fields were NOT changed to `{exact:...}` (graceful contract preserved).

---

## RF1-S2: unappliedAudioProcessing truth table  **[tsx-unit]**
**Type:** feature (the new pure verifier helper)

### Acceptance Criteria (inputs → exact outputs)
`unappliedAudioProcessing(settings)` returns a string array naming exactly which of `echoCancellation` / `noiseSuppression` / `autoGainControl` came back **explicitly `false`** from `track.getSettings()`. An **absent** field (undefined) is NOT flagged. Concrete cases:

| input `settings` | exact return |
|---|---|
| `{ echoCancellation:true, noiseSuppression:true, autoGainControl:true }` | `[]` |
| `{ echoCancellation:false }` | `['echoCancellation']` |
| `{ noiseSuppression:false }` | `['noiseSuppression']` |
| `{ autoGainControl:false }` | `['autoGainControl']` |
| `{}` (all absent) | `[]` |
| `{ echoCancellation:false, noiseSuppression:false, autoGainControl:false }` | `['echoCancellation','noiseSuppression','autoGainControl']` |

Order of names in the all-false case MUST be deterministic (the order the helper checks them); assert with `assert.deepStrictEqual` against the exact expected array.

### Steps
1. From `frontend/`, run the new B2 tsx spec covering all six rows.
2. Use `assert.deepStrictEqual(unappliedAudioProcessing(input), expected)` per row.

### Edge Cases
- Field present but value `true` → NOT flagged (only explicit `false` flags).
- A field equal to `0` or `''` (not boolean false) MUST NOT flag — assert helper checks strict `=== false`, not falsiness. Add a row `{ echoCancellation: 0 as any }` → `[]`.
- `undefined`/`null`-ish field absent → not flagged (same as `{}` row).

### Verification
Run spec; expect all six (plus edge) assertions pass. This is the verifier the media.service log line calls.

---

## RF1-S3: media.service verifier call is log-only (zero behavior change)  **[build]** + **[manual-localhost]**
**Type:** regression

### Acceptance Criteria (concrete, assertable)
- The audio-acquire chokepoint in `media.service.ts` (the `audioCaptureConstraints(audio, deviceId)` path feeding `getUserMedia`) gains exactly ONE log-only line that calls `unappliedAudioProcessing(track.getSettings())` and logs the result. Assert via diff: the only new statement is a `console.*` (debug/info/warn) line; NO new branch, NO early return, NO track/constraint mutation, NO state/signal write.
- Build is clean: `npx ng build` from `frontend/` exits 0 (typecheck passes — `getSettings()` shape feeds the helper without `any`-leak errors).

### Steps
1. `git diff` `media.service.ts` — confirm the inserted line is purely a logging statement passing `track.getSettings()` to `unappliedAudioProcessing`.
2. `npx ng build` from `frontend/` → exit 0.
3. **[manual-localhost]** Join a room locally with a normal mic; open devtools console. Expect a single log line per audio acquire naming unapplied processing (typically `[]` on a laptop). No duplicate/looping logs, no errors.

### Edge Cases
- Acquire on a device that rejects EC/NS/AGC → log lists the rejected names; capture STILL succeeds (graceful `{ideal}` means a track is still produced). No throw.
- `getSettings()` returning `{}` → logs empty list, no crash.

### Verification
Diff shows log-only insertion; build green; console shows the diagnostic with no behavioral side effects (mic still publishes — covered by RF4 regression specs).

---

## RF2-S4: FEEDBACK_LIMITER_PARAMS are limiter-shaped + no default amplification  **[tsx-unit]**
**Type:** feature

### Acceptance Criteria (inputs → exact outputs)
Exported constant `FEEDBACK_LIMITER_PARAMS` (from `remote-audio.service.ts` or a pure sibling importable by tsx) MUST satisfy:
- `threshold === -3` (dB; criterion: `<= 0`)
- `knee === 0`
- `ratio === 20` (criterion: `>= 20` — limiter-shaped, high ratio)
- `attack === 0.003` (s)
- `release === 0.25` (s)
- `DEFAULT_VOLUME === 1` (no default amplification > 1.0).

Assert each value with `assert.strictEqual`, plus the shape predicates `assert.ok(params.ratio >= 20)`, `assert.ok(params.threshold <= 0)`, `assert.strictEqual(params.knee, 0)`.

### Steps
1. From `frontend/`, run the new B2 tsx spec importing the params constant (and `DEFAULT_VOLUME` if exported; if not exported, assert via a build-time check in RF2-S5 instead and note it here).
2. Assert exact values and the limiter-shape predicates.

### Edge Cases
- If `FEEDBACK_LIMITER_PARAMS` is frozen/`as const`, assert it still reads the exact numbers (no need to assert immutability).
- Guard against accidental makeup gain: there is NO `makeupGain` / no extra gain node after the limiter — note for RF4-S8 (gain=0 ⇒ true silence).

### Verification
Run spec; all param assertions pass. Reviewer confirms ratio≥20, threshold≤0dB, knee=0, DEFAULT_VOLUME===1.

---

## RF2-S5: Limiter node inserted into the AudioContext graph (source→gain→limiter→destination)  **[build]** + **[manual-localhost]**
**Type:** feature

### Acceptance Criteria (concrete, assertable)
- `ensureGraph()` in `remote-audio.service.ts` creates a `DynamicsCompressorNode` (e.g. `context.createDynamicsCompressor()`) configured from `FEEDBACK_LIMITER_PARAMS` and wires the chain **gain → limiter → destination** (was `gain → destination`). Source nodes still `connect(this.gain)`. Assert via diff: `this.gain.connect(limiter)` and `limiter.connect(this.destination)` replace `this.gain.connect(this.destination)`.
- The limiter's six AudioParams are set from the named constants (threshold/knee/ratio/attack/release), not magic numbers inline.
- `reset()` disconnects the limiter (e.g. `this.limiter?.disconnect()`) and nulls it, alongside the existing gain/destination teardown. Assert via diff.
- `npx ng build` from `frontend/` exits 0.

### Steps
1. `git diff remote-audio.service.ts` — confirm node creation, the rewired chain, param assignment from constants, and `reset()` disconnect+null.
2. `npx ng build` → exit 0.
3. **[manual-localhost]** Join a room with one remote peer; confirm remote audio is audible and undistorted at normal speech (the limiter only engages above threshold). No console errors on graph build or on `reset()` (leave room).

### Edge Cases
- `reset()` called when limiter was never created (no graph built) → no throw (optional-chaining on disconnect).
- Re-entering a room after `reset()` rebuilds the full graph incl. a fresh limiter.

### Verification
Diff shows correct chain + teardown; build green; localhost playout works and reset is clean.

---

## RF2-S6: Normal speech is not audibly squashed by these params  **[live-two-device]** + **[manual-localhost]**
**Type:** feature (projcore emphasis (b))

### Acceptance Criteria (observable)
- With the limiter inline, a remote peer speaking at normal conversational level sounds natural — no pumping, no obvious gain reduction, no clipped attack. Threshold -3dB + ratio 20:1 only clamps peaks that exceed threshold (feedback runaway), not steady speech.
- A/B: speech before vs after the limiter insertion is perceptually equivalent at normal volume.

### Steps
1. **[manual-localhost]** Two browser tabs / loopback peer at normal speech volume → audio sounds normal, no artifacts.
2. **[live-two-device]** JROM two-device test at conversational levels with peers NOT in feedback range → confirm voice quality is unaffected by the limiter.

### Edge Cases
- Loud transient (cough, clap) → limiter clamps the peak (expected), no sustained pumping after.
- Volume slider raised toward MAX_VOLUME (1.3) → still no runaway; limiter caps the peak.

### Verification
JROM/manual listening confirms natural speech; limiter only acts on peaks. (Perceptual — recorded in changes.md as a live observation.)

---

## RF2-S7: Same-room feedback runaway is reduced  **[live-two-device]**
**Type:** feature (the headline outcome — RF, JROM report)

### Acceptance Criteria (observable, outcome not attempt)
- Two devices in the SAME room, both mics live + speakers on (the original feedback scenario). With the B2 changes deployed, the acoustic feedback loop is **measurably reduced** vs the pre-B2 build: no escalating howl/runaway; any residual feedback is bounded (limiter caps the output peak) rather than building uncontrollably.
- EC/NS/AGC are requested on capture (RF1) AND the output limiter caps the mixer peak (RF2) — the two suppression layers together tame the loop.

### Steps
1. Deploy DEV build (`npx ng build` from `frontend/` + `pm2 restart meet-poc-fe`).
2. **[live-two-device]** JROM joins the same room from two devices in one room, both unmuted, speakers up → observe feedback is reduced/bounded vs the prior build.

### Edge Cases
- Honest limit (RF5): software cannot FULLY eliminate two-device acoustic feedback — headphones / muting one device remains the only total fix. A residual, non-escalating loop is an ACCEPTABLE outcome for suppression-only.

### Verification
JROM live two-device A/B: runaway howl is gone or markedly reduced and bounded. Recorded in changes.md.

---

## RF3-S8: NO detection UI / auto-mute / warning banner introduced  **[tsx-unit-grep]** + **[build]**
**Type:** regression (negative assertion — locked JROM constraint)

### Acceptance Criteria (concrete, assertable via diff grep)
The B2 diff MUST contain NONE of:
- New template/banner markup for feedback detection (no new `*ngIf`/`@if` banner, no new component, no new HTML in any `.html` or inline template tied to "feedback"/"echo"/"same room").
- Any auto-mute logic (no new call to `setMutedAll(true)` / track-disable driven by a feedback/energy heuristic).
- Any feedback-detection signal/threshold/timer added to drive UI.

### Steps
1. `git diff main...HEAD -- frontend/src` → grep for new banner/template additions, new `setMutedAll(true)` call sites, new "feedback"/"detect" UI symbols. Expect ZERO matches beyond the limiter + log line + pure helper.
2. Confirm the only touched files are the three approved: `mic-energy.ts`, `media.service.ts`, `remote-audio.service.ts` (plus the new B2 spec(s)). `git diff --name-only` lists exactly these.
3. `npx ng build` → exit 0 (no new UI to compile).

### Edge Cases
- A `console.*` log naming unapplied processing (RF1-S3) is NOT UI — allowed.
- The limiter is signal-path only, drives no template — allowed.

### Verification
Diff name-list = the 3 files (+ spec); grep finds no UI/auto-mute/banner additions.

---

## RF4-S9: mute-all gain=0 yields SILENCE through the limiter  **[tsx-unit]** (param proof) + **[manual-localhost]** (live graph)
**Type:** regression (projcore emphasis (a) — the load-bearing one)

### Acceptance Criteria
- The limiter (`DynamicsCompressorNode`) has NO makeup gain: 0-amplitude input ⇒ 0-amplitude output. Assert (tsx) that `FEEDBACK_LIMITER_PARAMS` contains no makeup-gain field and `DEFAULT_VOLUME===1` (no >1 amplification anywhere); document that a compressor with no makeup gain cannot turn 0 into non-0.
- `setMutedAll(true)` sets `gain.gain.value = 0` (existing behavior, unchanged by B2). Because the chain is gain→limiter→destination and the limiter adds no gain, mixer output is true silence when muted-all.
- `setMutedAll(false)` restores `gain.gain.value = volume()`.

### Steps
1. **[tsx-unit]** Assert params have no makeup gain and DEFAULT_VOLUME===1 (covered by RF2-S4; re-asserted here in mute-all context).
2. **[manual-localhost]** In a room with a remote peer audible, toggle mute-all ON → remote audio goes fully silent (not merely quieter). Toggle OFF → audio returns at the prior volume. Verify against `debugSnapshot().mutedAll` / `.volume`.

### Edge Cases
- Mute-all ON while volume slider mid-range → still full silence (gain=0 dominates).
- Mute-all ON before any source added, then a peer joins → new source mixes into a gain=0 chain ⇒ silent until unmuted.

### Verification
Param proof in tsx; localhost confirms mute-all = total silence through the limiter (the limiter does not leak signal). debugSnapshot reflects state.

---

## RF4-S10: No regression to remote-audio playout / volume / device selection — re-run existing specs  **[tsx-unit]** + **[manual-localhost]**
**Type:** regression (projcore emphasis (c))

### Acceptance Criteria
- The existing pure spec `frontend/src/app/services/remote-audio-playability.spec.ts` (U1–U10) STILL passes unchanged — proves the B1 playout decision (suspended-context banner, per-peer fallback, mixer-disabled) is not regressed by the limiter insertion.
- The existing `mic-energy.spec.ts` STILL passes unchanged.
- `setVolume(v)` still clamps to `[0, MAX_VOLUME=1.3]` and writes `gain.gain.value` when not muted (unchanged logic).
- Output device selection (`applyOutputDevice` / `applySinkId`) unaffected — limiter is upstream of the destination/output element, sink routing unchanged.

### Steps
1. From `frontend/`: `npx tsx src/app/services/remote-audio-playability.spec.ts` → `all assertions passed`, exit 0.
2. From `frontend/`: `npx tsx src/app/services/mic-energy.spec.ts` → `all assertions passed`, exit 0.
3. Run the new B2 tsx spec(s) → pass.
4. **[manual-localhost]** Join with a remote peer: audio plays (B1 fix intact); move the volume slider → loudness tracks; switch output device (if >1 available) → audio follows the new sink. No console errors.

### Edge Cases
- Suspended-context (autoplay-blocked) path: unlock via gesture still resumes and plays — limiter doesn't change the resume/playability verdict (it's a graph node, not a decision input).
- `reset()` then re-join → playout works again with a fresh limiter.

### Verification
All three tsx specs green; localhost confirms playout + volume + device selection unregressed.

---

## RF5-S11: Honest documentation note in changes.md  **[manual-localhost]** (doc check)
**Type:** feature (requirement compliance)

### Acceptance Criteria (concrete)
- `changes.md` for B2 contains an explicit honest note stating software suppression **reduces but cannot fully eliminate** two-device acoustic feedback, and that headphones / muting one device remains the only total fix.
- The note records: (1) capture-side EC/NS/AGC are best-effort `{ideal}` (a device may decline them — surfaced by the `unappliedAudioProcessing` log, not enforced); (2) the output limiter caps peaks (suppression), it is not detection/auto-mute.

### Steps
1. Read B2 `changes.md` — confirm the honest-limitation paragraph and the two recorded facts above are present.

### Edge Cases
- Note must NOT claim feedback is "fixed"/"eliminated" — only "reduced/suppressed". A claim of full elimination is a REJECT.

### Verification
Reviewer reads changes.md; the honest reduce-not-eliminate note is present and accurate.

---

## Coverage map (RF → scenarios)
- **RF1** (capture EC+NS+AGC, single chokepoint, graceful; verifier helper) → S1, S2, S3
- **RF2** (output limiter; limiter-shaped params; no >1 amplification; graph insertion) → S4, S5, S6, S7
- **RF3** (NO detection UI / auto-mute / banner) → S8
- **RF4** (no regression: playout/volume/mute-all/device; mute-all gain=0 ⇒ silence; re-run existing specs) → S9, S10
- **RF5** (honest doc note) → S11
- projcore emphasis: (a) mute-all silence → S9; (b) normal speech not squashed → S6; (c) re-run existing remote-audio specs → S10.

STATUS: DONE
