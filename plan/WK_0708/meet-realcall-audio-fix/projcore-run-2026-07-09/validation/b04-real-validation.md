# B04-real Independent Validation

**Validator:** L2 codex55  
**Commit:** ab84f65  
**Date:** 2026-07-09  
**Verdict:** FAIL  
**device_mode:** fake-device  
**stimulus:** speech (bot-speech piper WAV fixtures)

## Gate Question

Q0: Does `decisions/T_gap.md` present a measured `T_gap` from D27 dropouts: no voiced energy during scripted speech plus missing STT words?

**Answer:** No. It presents an energy-over-script measurement as `VERIFIED`, but the transcript/STT corroboration required by D27 is missing from the decision artifact and is not used by the analyzer.

## Evidence Checked

- `decisions/T_gap.md` exists and reports `Measured T_gap: 580 ms`.
- `decisions/T_gap.md` lists both calls with `Transcript: N/A`.
- WAV evidence exists:
  - `validation/b04-real-evidence/call1-receive.wav` (PCM WAV, mono, 48 kHz)
  - `validation/b04-real-evidence/call2-receive.wav` (PCM WAV, mono, 48 kHz)
- `callbacks.md` logs `impl B04-real STATUS: DONE - ab84f65 T_gap=580ms 2x~40s fake-device+speech; evidence WAVs; Transcript N/A noted`.
- Root `ledger-state.json` contains the B04-real room IDs `dfe4d5209786` and `260b2804e7ff`; the run also has known split-ledger pollution, so burn accounting is logged but not cleanly authoritative.

## Blocking Findings

1. **D27 transcript corroboration is absent.**  
   D27 requires dropout = far-end no-voiced energy during scripted peer speech plus missing transcript words. `T_gap.md` explicitly says `Transcript: N/A` for both calls, and no transcript artifacts are preserved under `validation/b04-real-evidence/`.

2. **The analyzer does not use STT to decide dropouts.**  
   `b04-real-tgap-derivation.browser.test.ts` calls `runLocalWhisper()`, but the returned `stt` data is only stored on `globalThis`; it is not passed into `detectDropouts()` or `analyzeCall()`, not compared against expected words, and not persisted into the decision. `dropout-analyzer.ts` detects only silence overlap with scripted far-end utterance windows.

3. **The decision overclaims the evidence class.**  
   `T_gap.md` marks `Status: VERIFIED` and says ACs may verify against the 580 ms value. With `Transcript: N/A`, the honest label would have to be energy-only/provisional. It is not labeled that way.

4. **Timing conversion has a concrete sample-rate risk.**  
   The preserved WAVs are 48 kHz, but `detectSilenceSpans()` converts `startSample`/`endSample` to milliseconds using a hardcoded 16 kHz sample rate. That undermines the measured dropout durations independent of the missing STT issue.

## Verdict

**FAIL.** `decisions/T_gap.md` does not present a D27-complete measured `T_gap`. WAVs exist and device/stimulus provenance is declared as `fake-device + speech`, but the missing STT corroboration is critical and the artifact overlabels an energy-only path as verified.

No AC is closed by this validation.

STATUS: DONE - FAIL
