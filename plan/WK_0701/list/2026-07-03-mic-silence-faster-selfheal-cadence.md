# Faster self-heal retry cadence for the mic-silence watchdog

- **Type:** bug/enhancement
- **Status:** FIXED + INDEPENDENTLY VALIDATED (R1, commit `d2cbce9`) — NOT yet merged to `main` /
  deployed. Run `projcore-run-2026-07-03` PAUSED 2026-07-04 (token budget, JROM) before
  merge/deploy decision was made or red-team pass run. See run's `context-handoff.md`.
- **Raised:** 2026-07-03 · **Handler:** projcore

## JROM verbatim
> "also can we have a faster self-heal cycle when the user is on the call w/ problems like every
> 5-10 secs instead of 20, do 20-30 if its a just polling to check"

## Context
Surfaced while diagnosing a 2026-07-03 morning call ("ReceiptBOT" room) where participant
`acctg`'s microphone dropped mid-call and the existing mic-silence watchdog only ran one
device-recovery sweep before falling back to a passive banner — the silence rode for ~61
minutes. JROM confirmed the faster cadence applies to the mic-silence watchdog only, not the
separate WK_0701 SFU subscribe-recovery escalation ladder.

## qa_verification
Independent validator PASS (`batch-1/independent-validation.md`) — pure gate, dual bounds fire
independently, completion-based cooldown, race guard wired, devicechange re-arm, tests+build
re-run green, no scope creep. Still owed: standard-tier red-team pass, and a post-fix live
regression proof specifically for this retry-cadence behavior (deferred with the run).
