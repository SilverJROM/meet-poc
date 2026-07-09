# P2-LOCAL-04 Validation: Capture-Injection + Recording-Arbiter INVALID≠PASS Matrix

**Batch**: P2-LOCAL-04  
**Branch**: batch-01-diagnosis-2026-07-08  
**Test Run**: 2026-07-09 13:29:55 +0800  
**Result**: ✅ ALL PASS (51 tests, maxForks 3)

---

## Coverage Matrix: INVALID ≠ PASS ≠ FAIL

### b07-capture-injection.test.ts (9 tests)
Pure classification logic for T_GAP phase analysis. No verdict production.

| Test | Coverage | Verdict Path |
|------|----------|--------------|
| buildInjectionTimeline defaults holdDurationMs | PROVISIONAL wiring | N/A (setup) |
| buildInjectionTimeline accepts override | Config override | N/A (setup) |
| frozen-nonzero classification (856104f baseline) | Dead holdphase signature | N/A (pre-verdict) |
| silent classification | Silent holdphase signature | N/A (pre-verdict) |
| neither classification (genuine variance) | False-positive kill | N/A (pre-verdict) |
| indeterminate with <2 readings | Edge case (empty, single) | N/A (pre-verdict) |
| variance boundary exactly at threshold | Boundary condition (< strict) | N/A (pre-verdict) |
| silence level boundary exactly at threshold | Boundary condition (< strict) | N/A (pre-verdict) |
| custom threshold override | Parameterized thresholds | N/A (pre-verdict) |

**Gap**: No INVALID verdict from this layer—it's a pure function. Verdict verdict is produced downstream.

---

### gum-shim.test.ts (12 tests)
**CRITICAL**: Comprehensive INVALID ≠ PASS ≠ FAIL matrix here.

#### withinTolerance (4 tests)
| Test | Input | Expected | Verdict |
|------|-------|----------|---------|
| exact match | intended=0.5, measured=0.5 | true | (no-verdict fn) |
| exactly at +/-20% boundary | intended=0.5, measured=0.6 or 0.4 | true | (no-verdict fn) |
| just outside +/-20% boundary | intended=0.5, measured=0.61 or 0.39 | false | (no-verdict fn) |
| intended=0 requires exact zero | intended=0, measured=0 | true; any nonzero false | (no-verdict fn) |

#### computeStimulusVerification (3 tests)
| Test | Inputs | Verification State | Verdict Path |
|------|--------|-------------------|--------------|
| within-tolerance ratio | intended=0.5, baseline=1.0, attenuated=0.5 | withinTolerance=true | → PASS |
| AGC clawback (out-of-tolerance) | intended=0.5, baseline=1.0, attenuated=0.95 | withinTolerance=false | → FAIL |
| zero baseline guard (no NaN/Inf) | intended=0.5, baseline=0, attenuated=0.3 | measuredGain=0 (guarded) | → INVALID |

#### verifyStimulus + determineVerdict (5 tests) — **THE INVALID≠PASS≠FAIL PROOF**

| Test Case | Condition | Return Value | Arbiter Verdict | Distinction |
|-----------|-----------|--------------|-----------------|-------------|
| **PASS Case** | r=0.50 within tolerance, baseline present | `StimulusVerification` object | **PASS** | "Stimulus verification passed" |
| **INVALID Case 1** | Missing baseline (reference=null) | `undefined` | **INVALID** | "Missing stimulus verification" (not false PASS) |
| **INVALID Case 2** | Zero baseline (degenerate) | `undefined` | **INVALID** | "Missing stimulus verification" (not false PASS) |
| **FAIL Case** | Out-of-tolerance (r=0.95 vs 0.50) | `StimulusVerification` object | **FAIL** | "Stimulus verification failed" (measured gain diverges from intended) |
| **INVALID Case 3** | Dead mic (baseline=0.005, below MIN_BASELINE) | `undefined` | **INVALID** | "Missing stimulus verification" (not false PASS, not FAIL) |

**Key Invariant (D19)**: An INVALID control (missing/degenerate baseline) is **definitionally distinct** from a FAIL (bad measurement). The trio are orthogonal states.

---

### recording-arbiter.test.ts (15 tests)
**Verdict verdict production** (deterministic) tested with synthetic WAV files.

#### LoudnessAnalyzer (7 tests)
Pure measurement — no verdicts. Validates RMS/LUFS computation and voiced-segment extraction.

| Test | Coverage | Purpose |
|------|----------|---------|
| RMS of sine wave | Amplitude / √2 formula | Baseline measurement |
| RMS of constant signal | Expected = input | Edge case (uniform) |
| RMS of silence | ~0 | Lower bound |
| LUFS of voiced signal | Finite negative | Perceptual loudness metric |
| LUFS of silence | -Infinity | Lower bound (canonical) |
| Loudness ratio (A = quiet/normal) | Ratio computation | Pre-verdict comparison |
| Zero baseline ratio guard | ratio=0 (not NaN) | Guard against division-by-zero |
| Voiced segment extraction | Multi-segment splits | Temporal structure |

#### RecordingArbiter (8 tests) — **Verdict Verdict Verdict**

| Test | Setup | Stimulus Verification | Verdict | Evidence |
|------|-------|----------------------|---------|----------|
| **PASS** | Synthetic WAV (0.4 amplitude) | intendedGain=0.5, measuredGain=0.5, withinTolerance=true | **PASS** | "Stimulus verification passed" |
| **INVALID** | Synthetic WAV (0.4 amplitude) | `undefined` (missing) | **INVALID** | "Missing stimulus verification" |
| **FAIL** | Synthetic WAV (0.4 amplitude) | intendedGain=0.5, measuredGain=0.3, withinTolerance=false | **FAIL** | "Stimulus verification failed" |
| Round-trip (ratio) | normal=0.4, quiet=0.2 | Computed ratio=0.5±0.05 | (ratio check) | Loudness ratio accurate |
| Sidecar file write | PASS verdict | File path = `<wav>.verdict.json` | (file check) | Verdict persisted |
| Multi-segment recording | 3s audio (voice-silence-voice) | Full analysis | (structure check) | Voiced segments detected |

---

### receive-side-recorder.test.ts (15 tests)
**INVALID taxonomy** — fine-grained classification of capture-hook states (pre-verdict).

| Classification | Test Count | States Covered | Verdict Path |
|---|---|---|---|
| **INVALID_HOOK_MISSING** | 2 | state=null, installed=false | → upstream rejection |
| **INVALID_RELOAD** | 3 | documentLoadCount > 1 | → upstream rejection |
| **INVALID_NO_PC** | 2 | pcCount=0 (with/without stats) | → upstream rejection |
| **INVALID_HOOK_BLIND** | 1 | trackCount=0 but inbound RTP >0 | → upstream rejection |
| **PRODUCT_NO_MEDIA** | 1 | trackCount=0 AND inbound RTP=0 | → valid product state (not captured, expected) |
| **INVALID_AUDIO_GRAPH** | 2 | trackCount≥1 but callbackCount=0 or context not running | → upstream rejection |
| **SILENCE** | 2 | trackCount≥1, context running, but RMS≈0 | → valid product state (silent capture) |
| **VALID** | 2 | trackCount≥1, context running, RMS > threshold | → valid product state (captured) |

**Key Insight**: These are **pre-verdict** classifications (capture-hook health). They feed into the recording-arbiter verdict pipeline downstream.

---

## Gap Analysis: Missing INVALID ≠ PASS ≠ FAIL Distinctions?

### Q1: Dead Baseline (B00S-MIN_BASELINE)?
✅ **COVERED** — gum-shim.test.ts line 84–91: "dead mic: noise-floor baseline below MIN_BASELINE returns INVALID not false PASS"

### Q2: Out-of-Tolerance (B00S-AGC)?
✅ **COVERED** — gum-shim.test.ts line 77–82: "out-of-tolerance measurement is FAIL, distinct from INVALID"

### Q3: Verified (Stimulus Within Tolerance)?
✅ **COVERED** — gum-shim.test.ts line 56–61: "r=0.50 within tolerance verifies and the arbiter returns PASS"

### Q4: Missing Baseline (Null Reference)?
✅ **COVERED** — gum-shim.test.ts line 63–68: "invalid control: missing baseline (reference never captured) cannot be verified -> INVALID, not a false PASS"

### Q5: Zero Baseline (Degenerate Reference)?
✅ **COVERED** — gum-shim.test.ts line 70–75: "invalid control: zero baseline (degenerate reference) cannot be verified -> INVALID"

### Q6: Capture-Hook Blind Spot (INVALID_HOOK_BLIND)?
✅ **COVERED** — receive-side-recorder.test.ts line 91–103: "INVALID_HOOK_BLIND: trackCount === 0 but stats show inbound audio RTP"

---

## Verdict on P2-LOCAL-04

**Status**: ✅ APPROVED  
**Test Result**: 51/51 PASS (4 files, maxForks=3 configured)  
**Coverage Verdict**: Full INVALID≠PASS≠FAIL matrix is in place:
- **INVALID path**: Missing/degenerate baseline, dead mic, capture-hook blind spot
- **PASS path**: Stimulus within tolerance
- **FAIL path**: Stimulus out-of-tolerance

No gaps identified. No new tests needed. Unit-only scope (no SFU, no joinDualBrowserCall) satisfied.

---

## Commit-Ready Status

- ✅ All tests green
- ✅ No capture-injection or recording-arbiter gaps
- ✅ Coverage matrix validated
- ✅ INVALID≠PASS proof documented

Ready to commit on branch `batch-01-diagnosis-2026-07-08`.
