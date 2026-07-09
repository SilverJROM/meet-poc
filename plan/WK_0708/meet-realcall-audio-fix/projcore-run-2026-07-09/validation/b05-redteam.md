# B05 Redteam Report — Forced weak-signal gUM shim + stimulus verifier

**STATUS: CLEAN**

---

## Redteam Hunt Summary

Three critical paths verified against D19 spec and acceptance criteria.

---

## Findings

### 1. AGC path: Gain position relative to getUserMedia()

**Verdict: PASS**

Confirmed the `GainNode` is applied **strictly downstream** of Chrome's own audio processing:

- **Line 32** (`gum-shim.ts`): `const realStream = await originalGetUserMedia(constraints);` acquires the REAL track **first**, after Chrome's AGC/EC/NS have already run.
- **Lines 48–53**: The `GainNode` is created and wired **after** the real stream is captured. Source node feeds the REAL (already-processed) track.
- **Lines 46–47 comment**: "Source is the REAL, already-AGC/EC/NS-processed audio track. Everything from here down is downstream of Chrome's own processing." — design intent is explicit.
- **Real-browser proof** (`gum-shim.browser.test.ts`, lines 87–100): Captures baseline RMS (no shim) and attenuated RMS (with shim applied before navigation). Verifies the shim attenuates the final track; if the GainNode were upstream of AGC, the measured attenuation would be clawed back by AGC re-normalization, breaking the test.

✅ **No AGC clawback risk.** Attenuation is applied after AGC has finished; AGC cannot re-normalize what it has already processed.

---

### 2. Stimulus verification: PASS without verification

**Verdict: PASS**

Confirmed `INVALID` and `PASS` remain distinct code paths; missing stimulus does not silently pass:

- **Line 96** (`gum-shim.ts`, `verifyStimulus`): Returns `undefined` if `baselineLevel === null || attenuatedLevel === null || baselineLevel <= 0`.
- **Unit test** (`gum-shim.test.ts`, lines 63–75):
  - Line 64: `verifyStimulus(0.5, null, 0.3)` → `undefined` (missing baseline).
  - Line 72: `verifyStimulus(0.5, 0, 0.3)` → `undefined` (zero baseline, degenerate reference).
  - Lines 65–68, 73: `arbiter.determineVerdict(analysis, undefined)` → `INVALID`, **not** `PASS`.
- **Out-of-tolerance case** (lines 77–82): Distinct — when measurement is out of ±20% tolerance, verdict is `FAIL`, confirming all three verdicts (`PASS`, `FAIL`, `INVALID`) are separate code paths.
- **Real-browser test** (`gum-shim.browser.test.ts`, lines 119–122): Invalid control captures `verifyStimulus(0.5, null, attenuatedRms)` and confirms `arbiter.determineVerdict()` returns `INVALID`.

✅ **No silent PASS.** Missing or degenerate stimulus blocks verification and returns `INVALID` per D19's "third verdict must exist in code."

---

### 3. App code isolation: media.service.ts / mic-energy.ts untouched

**Verdict: PASS**

- Confirmed via `git diff HEAD^ HEAD --name-only` — no edits to `media.service.ts` or `mic-energy.ts`.
- Scope is harness-only: `e2e/harness/gum-shim.ts` (new), test files in `e2e/harness/__tests__/`.
- App remains unaware of the shim; acquisition at `media.service.ts:55` works as-is.

✅ **App untouched.** Shim is transparent to the app.

---

## Acceptance Criteria Check

- ✅ r=0.50 stimulus verification within ±20% (unit + real-browser tests verify this).
- ✅ Invalid control returns `INVALID`, not `PASS` (unit + real-browser tests).
- ✅ No amplification/fix claim made in batch artifacts.
- ✅ No app edits.

---

## Conclusion

**CLEAN — no findings.** Implementation correctly places the `GainNode` downstream of Chrome's own audio processing, returns `undefined` (not silent `PASS`) when stimulus cannot be verified, and leaves app code untouched. D19 spec and acceptance criteria are met.
