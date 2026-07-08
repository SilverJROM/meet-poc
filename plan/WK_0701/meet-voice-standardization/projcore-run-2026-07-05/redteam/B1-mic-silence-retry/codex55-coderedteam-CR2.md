# codex55 CR2 verdict
Verdict: BUGS

## Findings
- `planMicSweepAttempt()` fixes the CR1 silent+blocked attempt burn, but it introduces a hidden reducer behavior change: blockers short-circuit before `nextSweepGate()` sees non-consuming re-arm states. `nextSweepGate()` explicitly re-arms on `classification === 'working'` and inactive mic at `frontend/src/app/services/mic-energy.ts:356-357`, but `planMicSweepAttempt()` returns the old state unchanged whenever `sweepInProgress` or `recoveryInFlight` is true at `frontend/src/app/services/mic-energy.ts:410-411`.
- Plausible sequence: persistent silence exhausts or nearly exhausts `micSweepGateState`; a local audio recovery is in flight while the replacement track is already live and stats classify `working`; `pollMicSilenceWatchdog()` calls `planMicSweepAttempt(..., classification, true, ..., { recoveryInFlight: true })` at `frontend/src/app/pages/room/room.page.ts:3819-3826`; the banner clears at `frontend/src/app/pages/room/room.page.ts:3828-3830`, but the retry gate does not re-arm. A later fresh silent episode inherits stale attempts/exhaustion instead of getting a new retry budget.
- The same short-circuit can mask already-exhausted terminal state while `recoveryInFlight` is true. If `micSweepGateState` is already exhausted and a silent watchdog poll occurs during audio recovery, `planMicSweepAttempt()` returns `exhausted: false` at `frontend/src/app/services/mic-energy.ts:410-411`; the watchdog then writes retry copy, not terminal copy, at `frontend/src/app/pages/room/room.page.ts:3833-3836`. That contradicts CR2's "watchdog-owned exhausted copy" model.
- The new tests prove the CR1 silent+blocked attempt-consumption bug, but they are too shallow for the new planner semantics. `frontend/src/app/services/mic-sweep.spec.ts:356-386` tests only silent blockers and inactive non-blocked re-arm; it does not test `working + recoveryInFlight`, `working + sweepInProgress`, or exhausted silent state under blockers. I ran `cd frontend && npx tsx src/app/services/mic-sweep.spec.ts`; it passed, so the current proof would not catch this regression.

## Required Fixes
- In `planMicSweepAttempt()`, do not block non-consuming reducer transitions. Let `!micActive` and `classification === 'working'` delegate to `nextSweepGate()` even when blockers are present, so mute/disable and energy-return re-arm the gate.
- Preserve exhausted reporting under blockers, or compute `exhausted` from the current state when `classification === 'silent'` and no sweep can launch. Blocked should mean "do not consume or launch," not "pretend not exhausted."
- Add tests covering `planMicSweepAttempt(armedOrExhausted, 'working', true, ..., { recoveryInFlight: true })` resets to `INITIAL_SWEEP_GATE_STATE`, plus exhausted silent state under `recoveryInFlight` keeps terminal ownership.

## Residual Risk
- No local/browser proof is required before dev_machine/Peer2 if the pure planner tests are expanded for the blocked non-consuming paths above; the remaining behavior is framework-free and deterministic. Without those tests, the CR2 proof can pass while the retry gate keeps stale budget after recovery.

STATUS: BUGS — blocked planner suppresses working re-arm and can mask exhausted terminal state
