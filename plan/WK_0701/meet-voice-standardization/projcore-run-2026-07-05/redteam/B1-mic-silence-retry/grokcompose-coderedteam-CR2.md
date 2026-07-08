# grokcompose CR2 verdict

Verdict: CLEAN

## Findings

### 1. Gate budget — CR1 defects are fixed

**No consumption without an eligible sweep.** Both call sites now route through `planMicSweepAttempt()` (`mic-energy.ts:402-426`) before persisting state:

- `verifyInitialCaptureEnergy()` — `room.page.ts:3501-3508` re-reads `captureGatePasses()` and passes `{ sweepInProgress, recoveryInFlight }` blockers; state is written only from `plan.nextState`.
- `pollMicSilenceWatchdog()` — `room.page.ts:3822-3839` uses the same planner; sweep launches only when `plan.shouldSweep`.

When either blocker is set, the planner returns `{ nextState: state, consumed: false, shouldSweep: false }` (`mic-energy.ts:410-412`). This directly closes CR1 bugs #1 and #2 (phantom `attempts` advance and join/watchdog double-charge).

**Double-charge concurrency trace (disproven on CR2).**

1. Watchdog can classify `'silent'` at ~2s (two samples suffice for `classifyMicCapture`).
2. It consumes attempt 1 and enters `runMicRecoverySweep`, setting `micSweepInProgress = true` synchronously at `room.page.ts:3518` before any `await`.
3. When `verifyInitialCaptureEnergy` resumes (~3.3s), `planMicSweepAttempt(..., { sweepInProgress: true, ... })` returns unchanged state — no second consumption, no no-op `runMicRecoverySweep()` at `3517`.

Reverse ordering is also safe: `verifyInitialCaptureEnergy` runs plan → `await runMicRecoverySweep()` in one synchronous stretch until `micSweepInProgress` is set; the watchdog bails at `room.page.ts:3803` before planning while a sweep owns the device.

**`planMicSweepAttempt` does not alter reducer math for eligible paths.** Unblocked calls delegate verbatim to `nextSweepGate` (`mic-energy.ts:414-425`). `consumed` is a read-only derivative (`nextState.attempts > state.attempts`). Cooldown is still applied only in `runMicRecoverySweep` `finally` (`room.page.ts:3598-3601`).

### 2. Live-state side effects

**Stale window after adopted recovery — fixed.** `runMicRecoverySweep` clears `micSilenceWindow` on `'adopted'` (`room.page.ts:3560`). A cleared window classifies `'indeterminate'` (`mic-sweep.spec.ts:403`), so the post-recovery false-retry path from CR1 is closed.

**`none-working` banner ownership — fixed for the CR1 failure mode.** Terminal copy is no longer set inside the `'none-working'` branch (`room.page.ts:3578-3583`). The next watchdog poll during cooldown correctly shows retry copy via `micSilenceWatchdogBannerMessage(classification, plan.exhausted)` (`room.page.ts:3834-3836`) while `plan.exhausted === false`. Terminal copy appears only when the gate is actually exhausted on poll — matching scenario S6.

**Prior poll banner survives sweep gaps.** While `micSweepInProgress`, the watchdog returns at `room.page.ts:3803` without touching banner signals, so retry copy from the last silent poll remains visible through the sweep and through `'none-working'` completion until the next poll refreshes it (~1s). No silent-no-warning gap was found for the main retry loop.

**`audioRecoveryInFlight` blocking vs exhausted terminal — does not block B1.**

`planMicSweepAttempt` forces `exhausted: false` on the blocker fast-path (`mic-energy.ts:410-412`). In theory this could downgrade terminal copy to retry copy. Traced call paths make that sequence non-actionable:

- **`sweepInProgress`:** `pollMicSilenceWatchdog` returns at `room.page.ts:3803` before calling `planMicSweepAttempt`. The in-progress blocker is only exercised by `verifyInitialCaptureEnergy`, which never sets banner copy. Exhausted UI cannot regress through this blocker on the watchdog path.
- **`recoveryInFlight`:** `recoverLocalTrack` is only entered on `ended` or debounced persistent-mute (`room.page.ts:3385-3395`, `3418-3435`). Both drive `micActive === false` on the next watchdog evaluation (`room.page.ts:3794-3799`, `3806-3811`), which re-arms `micSweepGateState` to `INITIAL_SWEEP_GATE_STATE` before planning. An exhausted episode is therefore cleared before `recoveryInFlight` can intersect a `'silent'` poll that would read `plan.exhausted`. When recovery completes, `audioRecoveryInFlight` clears synchronously in `finally` (`room.page.ts:3432-3434`) before the next 1s tick in the common case.

Residual inconsistency (non-blocking): `no-candidates` (`room.page.ts:3527-3528`) and `catch` (`room.page.ts:3593-3594`) still set terminal copy inside the sweep; the next non-exhausted poll can overwrite with retry copy — the same pattern deliberately removed from `'none-working'`. This is a minor messaging inconsistency, not a retry-budget or false-retry-after-recovery defect.

### 3. Test proof validity

**New tests would fail the CR1 wiring bug** if `planMicSweepAttempt` were removed and call sites reverted to persisting `nextSweepGate` output before guards: `mic-sweep.spec.ts:356-376` assert state identity under `sweepInProgress` / `recoveryInFlight` blockers; CR1 advanced `attempts` in those conditions.

**Tests are appropriately shallow for a pure adapter, not wrongly coupled.** They exercise exported planner/banner helpers without Angular harnesses — consistent with the file's existing pure-reducer discipline. They do not integration-bind `room.page.ts`, but static review confirms both call sites use the planner exclusively and match scenarios S1–S6 in `batch-B1/scenarios.md`.

**Gap that remains is proof class, not code correctness:** no browser/dev_machine retry-cadence run is in the test report. `npx tsx src/app/services/mic-sweep.spec.ts` and `npm run build` both pass (re-run 2026-07-05). That is sufficient for local red-team CR2; it is not sufficient for final R1 handback, which still owes live regression per `og-requirements.md` R1.

## Required Fixes

None.

## Residual Risk

- **Strongest remaining risk:** B1 has no live/browser proof that ~7s bounded retry cadence behaves correctly under real `getStats` lag, multi-device enumeration, or hardware unplug/replug. Local unit/build approval should not be mistaken for dev_machine/Peer2 sign-off.
- **Minor hardening opportunity:** derive `exhausted` from stored gate state in the blocker fast-path (and add one spec) so banner semantics stay correct even if a future caller invokes the planner without the watchdog's `micSweepInProgress` early-return.
- **Minor messaging inconsistency:** `no-candidates` / `catch` terminal copy inside `runMicRecoverySweep` vs watchdog-owned `'none-working'` path.

STATUS: CLEAN — CR2 closes CR1 budget/banner/window defects; remaining risk is missing live retry-cadence proof, not a traced local code bug