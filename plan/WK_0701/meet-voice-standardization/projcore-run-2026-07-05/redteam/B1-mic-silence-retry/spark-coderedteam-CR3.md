# spark CR3 verdict
Verdict: CLEAN

## Findings
- `frontend/src/app/services/mic-energy.ts:390+` now preserves nextSweepGate semantics under blockers by evaluating `nextSweepGate(...)` first, then suppressing launch/consumption only when blockers are active. This keeps `working` and `micActive === false` transitions semantically correct (re-arm/reset) while blocked.
- `frontend/src/app/services/mic-energy.ts` blocks only consuming sweep launch and reports `exhausted` from the underlying reducer, so blocked silent callers do not lose terminal-state visibility.
- `frontend/src/app/pages/room/room.page.ts` applies the planner in both `verifyInitialCaptureEnergy()` and `pollMicSilenceWatchdog()`, re-checking `captureGatePasses()` and blocker state before committing gate transitions and before running recovery.
- `frontend/src/app/pages/room/room.page.ts` delegates exhausted/retry banner text to `micSilenceWatchdogBannerMessage`, and `runMicRecoverySweep()` clears stale window on adopt and no longer owns terminal copy for `none-working`, matching watchdog-owned exhausted behavior.
- CR2 test additions in `frontend/src/app/services/mic-sweep.spec.ts` now fail on the original CR1/CR2 regressions (`working + blockers`, `inactive + blocker`, exhausted-blocked silent), and regression suites remain green per batch reports.

## Residual Risk
- Low: there is no dedicated unit assertion for every non-silent (`indeterminate`) blocked-path branch; however, current reducer contract plus unchanged `shouldSweep` behavior keeps this path non-consuming, and no remaining blocked-launch or phantom-consumption path is observable for B1 acceptance.

STATUS: CLEAN — CR3 closes both blocker-suppression regressions and aligns state-machine state transitions with watchdog-owned banner semantics, so this round can proceed to local B1 acceptance.
