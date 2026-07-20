# B04-real Independent Validation r3

**Validator:** Codex  
**Commit:** 720d406  
**Date:** 2026-07-09T09:23:40Z  
**Verdict:** FAIL  
**device_mode:** fake-device  
**stimulus:** speech (bot-speech piper WAV fixtures)

## Gate Question

Does B04-real now satisfy the r3 D27 gate: `detectDropouts()` / `analyzeCall()` take `sttData` and only mark a dropout when silence overlaps scripted far-end speech **and** expected STT words are missing?

**Answer:** No. The r2 blocker is partially fixed because STT is now passed into the B04 analyzer calls, but the analyzer still has a silence-only fallback when `sttData` is omitted. That violates the literal "only mark dropout when silence+script+missing words" rule.

## Checks

| # | Check | Result | Evidence |
|---|---|---:|---|
| 1 | `T_gap.md` is MEASURED | PASS | `decisions/T_gap.md` says `Status: MEASURED` and reports `Measured T_gap: 358 ms`. |
| 2 | Transcripts are present | PASS | `validation/b04-real-evidence/call1-transcript.json` and `call2-transcript.json` exist; current counts are call1 `wordCount=3`, call2 `wordCount=4`. |
| 3 | device_mode + stimulus declared | PASS | `T_gap.md` declares `Device mode: fake-device` and `Stimulus: real bot-speech piper WAV fixtures`; the B04 test sets `deviceMode: 'fake-device'`, `stimulus: 'speech'`, and fake-audio speech WAV launch args. |
| 4 | `detectDropouts()` / `analyzeCall()` accept `sttData` | PASS | `e2e/harness/dropout-analyzer.ts:64-69` adds `sttData?: STTData`; `:148-155` forwards it from `analyzeCall()` to `detectDropouts()`. |
| 5 | B04 test passes STT into analyzer decision path | PASS | `b04-real-tgap-derivation.browser.test.ts:337-348` and `:411-422` build `sttData` from Whisper output and pass it to both `detectDropouts()` and `analyzeCall()`. |
| 6 | Dropout is marked only when silence∩script AND missing expected words | FAIL | `dropout-analyzer.ts:88-90` uses `const isDropout = !sttData || hasExpectedWordsInSTT(...)`. If `sttData` is missing, silence/script overlap still marks a dropout without missing-word corroboration. |

## Blocking Finding

`sttData` is optional in both analyzer APIs and the decision condition still admits the old energy/script-only path:

```ts
const isDropout = !sttData || hasExpectedWordsInSTT(utterance.text, sttData);
```

For this gate, missing STT must not silently downgrade to a dropout decision. It should fail closed: no STT means no D27-complete dropout, or the call should be marked invalid/blocked before deriving `T_gap`.

## Verification Notes

- Reviewed the r3 diff from `HEAD~1..HEAD` for `dropout-analyzer.ts`, `b04-real-tgap-derivation.browser.test.ts`, and `decisions/T_gap.md`.
- Confirmed current evidence files under `validation/b04-real-evidence/`.
- Ran `npm exec -w e2e tsc -- --noEmit`; it failed on broad existing e2e type drift. The output also includes a touched B04 file error at `harness/__tests__/b04-real-tgap-derivation.browser.test.ts:274`, but the r3 verdict is already failed on the stricter D27 analyzer condition above.
- Did not rerun the real dual-browser call burn; this re-gate is a code/evidence-path validation against commit `720d406`.

## Verdict

**FAIL r3.** STT is now wired into the B04 call path, and the measured artifact/evidence provenance items pass. The analyzer still does not enforce missing-word corroboration as mandatory, so it does not meet the requested "only mark dropout when silence+script+missing words" condition.

No AC is closed by this validation.

STATUS: DONE - FAIL r3
