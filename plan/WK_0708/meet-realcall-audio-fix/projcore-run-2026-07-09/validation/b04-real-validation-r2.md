# B04-real Independent Validation r2

**Validator:** Codex  
**Commit:** a21eb8e  
**Date:** 2026-07-09T09:17:01Z  
**Verdict:** FAIL  
**device_mode:** fake-device  
**stimulus:** speech (bot-speech piper WAV fixtures)

## Gate Question

Does B04-real now provide a D27-complete measured T_gap: real receive-side WAV timing, transcript artifacts, STT corroboration of missing words, explicit device/stimulus provenance, and no AC closure?

**Answer:** No. The report/artifacts fix the prior status, path, transcript, and 48 kHz evidence issues, but the dropout analyzer still does not use STT/missing-word data to decide or corroborate dropouts. STT is collected and copied into the decision artifact, not wired into `detectDropouts()` / `analyzeCall()`.

## Checks

| # | Check | Result | Evidence |
|---|---|---:|---|
| 1 | `T_gap.md` status is MEASURED and transcript paths are not N/A | PASS | `decisions/T_gap.md:3` is `Status: MEASURED`; `:23` and `:32` list `call1-transcript.json` and `call2-transcript.json`; measured value is `350 ms` at `:4`. |
| 2 | Evidence dir has transcripts and WAVs | PASS | `validation/b04-real-evidence/` contains `call1-receive.wav`, `call2-receive.wav`, `call1-transcript.json`, `call2-transcript.json`. WAV header check: both mono 16-bit PCM at 48000 Hz. Transcript counts: call1 `wordCount=8`, call2 `wordCount=4`. |
| 3 | Analyzer uses WAV sample rate; STT wired | FAIL | Sample-rate conversion is fixed in `b04-real-tgap-derivation.browser.test.ts:179-190` by reading the WAV `fmt ` chunk. Whisper is invoked and transcripts are persisted at `:121-155`, `:332-341`, `:400-409`, and decision formatting includes word counts at `:247-258`. But `dropout-analyzer.ts:37-71` detects dropouts only from silence/script overlap, and `:115-143` analyzes calls with no STT argument or missing-word check. |
| 4 | `device_mode` fake-device + stimulus speech | PASS | `T_gap.md:54-57` declares fake-device + real bot-speech piper WAV fixtures. The B04-real call config sets `deviceMode: 'fake-device'`, `stimulus: 'speech'`, and fake-audio WAV launch args at `b04-real-tgap-derivation.browser.test.ts:313-318` and `:381-386`. |
| 5 | Honest no AC close | PASS | `T_gap.md:65-68` says B04-real closes no AC itself. `req-matrix.md` still has AC5/AC6/AC7 pending, and `queue-batches.md` still has B04-real processing rather than verified. |

## Blocking Finding

`dropout-analyzer.ts` still has no STT input, no expected-vs-recognized word comparison, and no way to reject a silence overlap that lacks missing-word corroboration. This leaves the measured distribution as energy/script-overlap plus separately reported STT word counts, not D27's combined evidence class.

## Verdict

**FAIL r2.** Prior FAIL items are partially fixed: `T_gap.md` is honestly marked MEASURED, transcript files exist, paths are no longer `N/A`, and the timing conversion uses the WAV sample rate. The gate remains failed until STT/missing-word corroboration is part of the analyzer path that decides the dropout set used for `T_gap=350ms`.

No AC is closed by this validation.

STATUS: DONE - FAIL r2
