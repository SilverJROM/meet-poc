# B1 Mic-Silence Retry — Red-Team CR1 Synthesis

Round: CR1  
Lens: L1/L2 structural correctness + false-positive retry behavior  
Verdict: BUGS — correction required before B1 can pass.

## Panel Verdicts

| Role | Verdict | Key finding |
| --- | --- | --- |
| codex55 | BUGS | Initial-capture and in-flight guards can consume retry attempts without a real sweep. |
| spark | BUGS | `audioRecoveryInFlight` can let `nextSweepGate` advance budget while recovery is skipped. |
| grokbuild | BUGS | Gate state advances before guards; banner copy can be overwritten after sweep outcomes. |
| grokcompose | BUGS | Watchdog/initial gate overlap can burn attempts; stale silence window can show retry copy after recovery. |

## Confirmed Bugs To Fix

1. **Retry budget can be consumed without running recovery.**
   - `verifyInitialCaptureEnergy()` persists `nextSweepGate()` output before proving no recovery/sweep is already in flight.
   - `pollMicSilenceWatchdog()` persists `nextSweepGate()` output before the `audioRecoveryInFlight` guard.
   - `runMicRecoverySweep()` can early-return on `micSweepInProgress` before its `finally`, so no cooldown is set for the skipped call.

2. **Initial capture and watchdog can double-charge one physical sweep.**
   - Watchdog can start a sweep while the initial capture gate is still sampling.
   - The initial gate can then consume another attempt and call `runMicRecoverySweep()`, which returns immediately because the sweep is already in progress.

3. **Post-sweep banner/window hygiene is weak.**
   - Adopted recovery clears the warning but leaves `micSilenceWindow` populated with stale low-energy samples.
   - `none-working` sets terminal copy inside the sweep, but the next non-exhausted poll can overwrite it with retry copy during cooldown.

## Correction Bar

- Never mutate `micSweepGateState` to a consumed attempt unless a recovery sweep is eligible to run.
- Initial capture must not advance gate state when `micSweepInProgress` or `audioRecoveryInFlight` is true, or when the mic is no longer active after sampling.
- Watchdog must early-return without gate consumption while `audioRecoveryInFlight` is true.
- Successful adopted recovery must clear stale silence samples so the retry banner does not reappear from old data.
- Terminal/exhausted banner ownership must be consistent: the watchdog gate exhaustion should be authoritative for exhausted copy, and sweep side-effects must not be immediately overwritten into misleading retry copy.
- Add targeted tests for at least the no-consumption-while-blocked path and banner/window cleanup behavior.

## State

Streak: 0/2. Any confirmed bug resets the standard red-team streak. After correction and strict gate,
run CR2 with a distinct lens.
