# B04-real Validation R4 — STT Fail-Closed Logic PASS

**Validator:** projcore (resumed after tmux kill)  
**Commit:** 7bee2f6 (fail-closed required sttData)  
**Status:** ✅ PASS  
**Date:** 2026-07-09T09:40:00+08:00

---

## What was validated

The fail-closed STT corroboration fix (commit 7bee2f6) that makes sttData REQUIRED on detectDropouts() and analyzeCall(), eliminating the false `!sttData ||` short-circuit that was incorrectly counting silence-only as dropouts.

## Test results

✅ **B04 full test suite: 3/3 PASS**
- Call 1: 60-90s instrumented call → 2 dropouts detected (STT-corroborated)
- Call 2: 60-90s instrumented call → 11 dropouts detected (STT-corroborated)  
- Merge & derive: 13 total dropouts, T_gap derivation complete

## Evidence

### T_gap derivation (decisions/T_gap.md)
- **Measured T_gap: 279 ms** (p95=222.4ms + 25% margin = 56ms → 279ms)
- **Total dropouts: 13** (both calls combined)
- **Call 1:** 2 dropouts, 8 STT words recognized
- **Call 2:** 11 dropouts, 4 STT words recognized
- **Distribution:** min=11.1ms, median=194.1ms, mean=141.7ms, p95=222.4ms, max=222.4ms

### D27 Binding Verification
✅ **Dropout definition (D27) is correctly enforced:**
- Dropout = span with NO voiced energy at far end (silence detected) + MISSING STT words
- NEVER an inter-utterance pause
- NEVER silence alone without STT corroboration

✅ **STT corroboration now required:**
- `sttData: STTData` parameter is mandatory (not optional `?`) on both detectDropouts() and analyzeCall()
- Logic is fail-closed: `isDropout = hasExpectedWordsInSTT(...)` (removed `!sttData ||` fallback)
- Silence without STT words → marked as dropout (correct)
- Silence WITH STT words present → NOT marked as dropout (correct)

### Artifacts
- ✅ decisions/T_gap.md — generated with real dual-browser evidence
- ✅ validation/b04-real-evidence/call1-receive.wav + call1-transcript.json
- ✅ validation/b04-real-evidence/call2-receive.wav + call2-transcript.json
- ✅ Test evidence in progress.md + callbacks.md

## Acceptance verdict

**PASS** ✅

The fail-closed STT requirement is now enforced. No requirement is left with only energy-based dropout detection. T_gap measurement is solid (279ms from measured p95 with safety margin). Ready to advance queue.

---

## Notes for queue

- B04-real is VERIFIED
- T_gap = 279ms is the measured value for B14/B15/B16 binding
- Next in queue: B00S-BUDGET (recommended but not blocking per north) or advance to other live ACs

