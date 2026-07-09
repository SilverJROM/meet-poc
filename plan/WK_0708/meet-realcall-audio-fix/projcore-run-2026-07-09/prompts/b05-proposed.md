# Batch B05 — Forced weak-signal gUM shim + stimulus verifier (capture-path)
## Proposed Implementation

**STATUS: PROPOSED**

---

## Objective

Implement D19's **forced (deterministic)** weak-signal mode: a Playwright-level `getUserMedia`
shim that attenuates the captured mic stream by a chosen ratio `r`, wired downstream of Chrome's
own audio processing so `autoGainControl` cannot claw the attenuation back before the app
publishes it. Pair it with a stimulus verifier so a run can be honestly marked **INVALID**
(stimulus never reached the recording) instead of silently reporting **PASS**. Capture-path only —
no amplifier/fix claim, no app change.

---

## Grounding (read against current code)

- **gUM chokepoint:** `frontend/src/app/services/media.service.ts:55` —
  `acquisitionQueue = createMediaAcquisitionQueue((constraints) => navigator.mediaDevices.getUserMedia(constraints))`.
  This is the single call site the app uses to acquire the mic track; the shim only needs to
  intercept `navigator.mediaDevices.getUserMedia` at the page level for the attenuation to be
  invisible to the app.
- **Why AGC would defeat a naive shim:** `frontend/src/app/services/mic-energy.ts` →
  `audioCaptureConstraints()` requests `echoCancellation`/`noiseSuppression`/`autoGainControl` all
  as `{ ideal: true }`. If the source is attenuated *before* `getUserMedia()` resolves, Chrome's
  own AGC can re-normalize it back toward its target level before the app ever sees the track —
  the weak-signal stimulus never reaches the system under test. D19's forced mode avoids this by
  gaining the track down **after** `getUserMedia()` has already returned the AGC/EC/NS-processed
  track.
- **Verdict plumbing already exists:** `e2e/harness/recording-arbiter.ts` already defines
  `StimulusVerification { intendedGain, measuredGain, withinTolerance }` and
  `RecordingArbiter.determineVerdict()` already returns `INVALID` when `stimulusVerification` is
  missing and `FAIL` when it's present but out of tolerance (landed in `202f156`, per D19's "a
  third verdict, and it must exist in the code"). B05 populates that interface for the first time;
  it does not need a new verdict type.

---

## Approach

### 1. `e2e/harness/gum-shim.ts` (new, pure-ish harness module)
- `buildGumShimScript(intendedRatio: number): string | Function` — the function handed to
  Playwright's `addInitScript`. Inside the page, at init time (before app code runs):
  - Capture the original `navigator.mediaDevices.getUserMedia`.
  - Replace it with a wrapper that:
    1. Calls the original to acquire the real, Chrome-processed `MediaStream`.
    2. Builds an `AudioContext` → `MediaStreamAudioSourceNode` (from the real audio track) →
       `GainNode` (`gain.value = intendedRatio`) → `MediaStreamAudioDestinationNode`.
    3. Returns a new `MediaStream` combining the destination node's attenuated audio track with
       any original video tracks untouched.
  - Attenuation happens strictly **downstream** of the real `getUserMedia()` return — i.e. after
    Chrome's EC/NS/AGC has already processed the signal — so AGC cannot see or correct it.
- Exported separately from Playwright so the gain-graph wiring is unit-testable without a browser
  (`e2e/harness/__tests__/gum-shim.test.ts`, mocked `AudioContext`/`MediaStream` graph).

### 2. Playwright wiring
- `await page.addInitScript(buildGumShimScript(r))` before `page.goto(...)`, applied to whichever
  role in the test is meant to be the weak-signal source for that scenario.
- No app-facing API changes: the app still calls `navigator.mediaDevices.getUserMedia(constraints)`
  once, at `media.service.ts:55`, and gets back a track it has no way to distinguish from a real
  one.

### 3. Stimulus verification
- After a call/recording completes, derive `measuredGain` from the receive-side recording (ratio
  of attenuated-run RMS/LUFS vs. an unattenuated reference level) and populate
  `StimulusVerification { intendedGain: r, measuredGain, withinTolerance: within ±20% }`.
- Pass this into `RecordingArbiter` so its existing verdict logic decides PASS / FAIL / INVALID —
  B05 does not touch `determineVerdict()`'s semantics, only supplies real data to it.

### 4. Invalid-control case
- One deliberate negative case (shim not applied, or gain forced back to 1.0 mid-stream) to prove
  the verifier actually distinguishes "stimulus arrived" from "stimulus didn't arrive" — asserts
  the harness returns `INVALID`, not a false `PASS`.

### 5. No app change
- `media.service.ts` and `mic-energy.ts` are read-only references for this batch. If the diff
  touches either file, that's a scope violation — the whole point of the forced-mode shim is that
  it works without app cooperation.

### 6. Binding for later batches (design-only, not implemented here)
- The later "A definition" batches need a same-speaker normal-vs-attenuated far-end comparison
  (per plan.md B05 binding note). Shape the verifier's recording/role pairing so a normal-reference
  pass can be captured first and compared against the attenuated pass — but do **not** implement
  that comparison logic in B05; it belongs to B07+/B08 which consume this verifier.

---

## Acceptance Criteria (from brief)

- ✅ For `r=0.50`: stimulus verification shows measured gain within ±20% of intended, sourced from
  an actual recording (not asserted from the shim's own gain setting).
- ✅ One invalid control case: harness reports `INVALID`, not `PASS`.
- ✅ No amplification/fix PASS claim made anywhere in this batch's output.
- ✅ No changes to `media.service.ts` / `mic-energy.ts` (app untouched).

---

## Risks (carried from deliberation)

- **AGC re-normalization:** mitigated by placing the `GainNode` strictly downstream of the real
  `getUserMedia()` return, after Chrome's own processing chain has already run.
- **Shim vs. app gUM chokepoint drift:** the shim assumes `media.service.ts:55` remains the sole
  `getUserMedia()` call site; if a future batch adds a second acquisition path, the shim needs to
  cover it too. Not expected to change in this batch.

---

## Dependencies

- **B02:** `RecordingArbiter` + `StimulusVerification` interface, INVALID/FAIL/PASS semantics
  (✅ done, verified — `058af0e`, `202f156`).

---

## Effort Estimate

~25 min (per `queue-batches.md` B05 estimate).

---

## Notes for Validator (L3 opus) / Redteam (standard)

- Confirm the `GainNode` sits **after** the real `getUserMedia()` resolution, not before —
  upstream attenuation is exactly what AGC would re-normalize, defeating the whole point of forced
  mode.
- Confirm `INVALID` and `FAIL` remain distinct code paths (D19's "third verdict must exist in
  code" — already true post-`202f156`; B05 must not collapse them).
- Confirm the diff contains no edits to `media.service.ts` or `mic-energy.ts`.
- Confirm the invalid-control case is a real negative test (asserts `INVALID`), not just documented
  as a risk.

---

## Handshake

Awaiting **APPROVED-PLAN** before implementation begins.
