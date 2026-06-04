# FIX1 — Independent Validation (3-agent): REC1-iOS recorder-ctx-resume + REC2 source-churn guard

**Verdict: SOLID** (projcore + independent 2nd validator both SOLID). Committed by projcore. Verifier ≠ fixer. These are the only two confirmed-real findings from the POSTFIX1 R1 fan-out (both recording ants, non-goal-blocking).

## Proof re-run by projcore
- `npx tsx` recorder-leaks + room-recording + active-speaker-leaks: pass. `npx tsc --noEmit`: 0. `npx ng build`: green. DEV pm2 meet-poc-fe restarted.

## Diff review (scope clean — recorder.service.ts + room.page.ts[1 line] + spec; no SFU/signaling/B12-republish/finalize-once touched)
- **REC1** `resumeAudioContext()`: guard `!isRecording() || ctx?.state!=='suspended'` → no-op unless recording AND suspended (null ctx → undefined !== 'suspended' → returns); try/catch swallows + warns, never throws. Called in `resumeAfterLifecycleFreeze` as `if (isRecording()) await resumeAudioContext()` BEFORE the existing B12 SFU-republish guard (republish path unchanged). ✅
- **REC2** `streamFor` map: set atomically with `sourceFor` (same try block); `addStream` no-op iff `sourceFor.has(clientId) && streamFor.get(clientId)===stream`; genuine stream change (diff object) → removePeerStream + replace; `removePeerStream` deletes streamFor in BOTH branches; `cleanupAudioGraph`+`start()` clear both. No-op requires `sourceFor.has` FIRST → a stale streamFor entry can never suppress a legitimate add. sourceCount/recordedClientIds still sourced from sourceFor only; 'local' source untouched. ✅

## Independent 2nd validator (sonnet, adversarial on streamFor staleness) — SOLID
Confirmed: no path sets streamFor without sourceFor; the sourceFor.has-first guard makes a wrongful-skip impossible; removal clears both so a later same-stream re-add is NOT suppressed; genuine change replaces. REC1 never throws + B12 untouched. No B17-LEAK2/B18/B21c/B12 regression. tsc 0, 3 specs pass.

## Honesty
Real iOS background-resume recording audibility is JROM's device seat; the resume-wiring + churn-guard are unit-proven + adversarially traced.
