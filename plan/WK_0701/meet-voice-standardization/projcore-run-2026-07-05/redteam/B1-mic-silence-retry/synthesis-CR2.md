# B1 Mic-Silence Retry — Red-Team CR2 Synthesis

Round: CR2  
Lens: concurrency trace + live-state side effects + proof validity  
Verdict: BUGS — correction required before B1 can pass.

## Panel Verdicts

| Role | Verdict | Key finding |
| --- | --- | --- |
| codex55 | BUGS | Blocked planner suppresses non-consuming working/inactive re-arm and can mask exhausted terminal state. |
| spark | BUGS | Blocked fast-path forces `exhausted:false`, allowing retry copy while an already-exhausted episode is blocked. |
| grokbuild | CLEAN | Core CR1 budget/stale-window bugs closed, but identified the same blocked working/exhausted residual risk. |
| grokcompose | CLEAN | Core CR1 budget/stale-window bugs closed; called exhausted derivation under blockers a hardening opportunity. |

## Confirmed Bugs To Fix

1. **Blocked fast-path suppresses non-consuming reducer transitions.**
   - `planMicSweepAttempt()` returns unchanged state whenever `sweepInProgress` or `recoveryInFlight` is true.
   - That also blocks `classification === 'working'` and `micActive === false` paths that should re-arm/reset without consuming retry budget.
   - Plausible result: a recovered/working mic can clear the banner while stale exhausted/nearly-exhausted gate state remains for a later fresh silent episode.

2. **Blocked fast-path masks exhausted terminal state.**
   - `planMicSweepAttempt()` returns `exhausted:false` for every blocked call.
   - A blocked silent poll over an already-exhausted state can show retry copy instead of terminal copy, contradicting watchdog-owned exhausted messaging.

3. **Tests miss blocked non-consuming transitions.**
   - Current tests cover blocked silent no-consumption, inactive non-blocked reset, and eligible consumption.
   - Missing tests: blocked `working` re-arms; blocked inactive re-arms; blocked exhausted silent reports `exhausted:true` while `shouldSweep:false` and `consumed:false`.

## Correction Bar

- `planMicSweepAttempt()` must block only consuming sweep launches, not non-consuming reducer transitions.
- For `classification === 'working'` or `micActive === false`, delegate to `nextSweepGate()` even when blockers are present, preserve `shouldSweep:false`, and do not consume.
- For blocked `classification === 'silent'`, preserve/report underlying exhaustion without launching or consuming.
- Add targeted tests for:
  - `working + recoveryInFlight` resets to `INITIAL_SWEEP_GATE_STATE`.
  - `working + sweepInProgress` resets to `INITIAL_SWEEP_GATE_STATE`.
  - `micActive=false + blocker` resets without consumption.
  - exhausted silent state under `recoveryInFlight` returns `exhausted:true`, `shouldSweep:false`, `consumed:false`.
- Re-run `cd frontend && npx tsx src/app/services/mic-sweep.spec.ts` and `cd frontend && npm run build`.

## State

Streak: 0/2. CR3 must run after correction with a fresh state-machine lens.
