# spark CR2 verdict
Verdict: BUGS

## Findings
- `frontend/src/app/services/mic-energy.ts:410-412` forces `exhausted: false` whenever `sweepInProgress` or `recoveryInFlight` blockers are set.
  `frontend/src/app/pages/room/room.page.ts:3821-3839` consumes that value to choose watchdog banner text.
  Plausible sequence:
  1. Mic-sweep reached terminal budget (`attempts` at `MIC_SWEEP_MAX_ATTEMPTS` or duration cap hit), so the pure gate is exhausted.
  2. A watchdog tick still runs while `this.micSweepInProgress === true` or `this.audioRecoveryInFlight === true`.
  3. `planMicSweepAttempt` returns `exhausted=false` due the blocker fast-path.
  4. UI writes retry copy (“Still trying to restore your microphone…”) instead of terminal copy, masking an already-exhausted state until the blocker clears.

## Required Fixes
- In `planMicSweepAttempt`, preserve/compute the underlying exhaustion state even when blockers are active (do not coerce to `false`), then keep `shouldSweep:false` and `consumed:false` for blocked callers.
- Add a unit test that blocked planning during in-progress/sweep while gate is exhausted keeps `exhausted:true` so watchdog banner copy is terminal.

## Residual Risk
- `none-working` now relies on watchdog-owned messaging; warning text may not appear until the next watchdog sampling cadence after the sweep outcome path.

STATUS: BUGS — CR2 fixes the major consumption/stale-window regressions, but blocked-path mask handling can still present non-terminal copy while budget is already exhausted.
