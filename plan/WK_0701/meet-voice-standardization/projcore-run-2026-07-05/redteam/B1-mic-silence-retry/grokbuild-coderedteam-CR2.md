# grokbuild CR2 verdict
Verdict: CLEAN

## Findings
- Gate budget consumption is now robust: `planMicSweepAttempt` (mic-energy.ts:410-422) checks `sweepInProgress || recoveryInFlight` *before* delegating to `nextSweepGate`. Callers in verifyInitialCaptureEnergy (room.page.ts:3502-3507) and pollMicSilenceWatchdog (3822-3826) only ever write a nextState that incremented attempts when plan.consumed===true and shouldSweep. Blocked cases return the input state unchanged with consumed=false.
- No double-charging of one physical sweep between initial capture and watchdog: verify now re-reads `micActive = captureGatePasses()` post-sample before planning; poll early-returns on `micSweepInProgress` before its plan (and plan would block anyway). Whichever launches first sets inProgress; the other either early-returns or gets blocked in plan. No path to two consumes for one run launch.
- `planMicSweepAttempt` introduces no hidden reducer behavior: it is a pure guard wrapper; when not blocked it produces identical nextState/should/exh as direct `nextSweepGate` would have (plus the `consumed` bit). Reducer tests for nextSweepGate and old R1 cases remain green; new planner tests exercise exactly the CR1 failure modes (blocked, post-sample inactive, eligible consume).
- Stale silence-window after recovery fixed: on 'adopted', `this.micSilenceWindow = []` (room.page.ts:3560) before clearing warning. Next poll sees <2 samples → 'indeterminate' (no retry banner); subsequent working samples clear cleanly. classify tests confirm stale was 'silent', cleared is 'indeterminate'.
- Banner ownership: none-working no longer sets terminal inside sweep (now watchdog via `micSilenceWatchdogBannerMessage` + plan.exhausted at 3835). Launcher poll sets "Still trying" on the consuming silent tick; post-sweep polls set terminal only when plan.exhausted. No-cands and catch still direct-set terminal, but these are edge cases and will be corrected by subsequent exh polls.
- audioRecoveryInFlight does not allow consumption (planner blocks before inc), but does force `exhausted:false` in returned plan, so a silent poll during recoveryInFlight will set "Still trying" (even if underlying gate state was already exhausted). This is a transient banner mask only; state itself is not mutated and corrects on next non-blocked poll.
- Tests: new CR1 section (mic-sweep.spec.ts:350+) directly asserts the outcomes that were broken in CR1 (no-consume on blockers, consumed only on eligible, window hygiene, banner fn). They are pure and would fail against the pre-correction adapter logic. Not full concurrent harness, but sufficient to prove the model; build+tsx still clean.

## Required Fixes
(none — core CR1 defects are closed)

## Residual Risk
- Transient "Still trying" banner while `audioRecoveryInFlight` + exhausted gate state (plan forces exh=false); direct terminal sets in no-candidates (3527) and catch (3593) can be overwritten by the next non-exhausted poll tick before exhaustion is reached.
- Working classification during recoveryInFlight does not re-arm gate to INITIAL (plan early-returns current state).
- No-cands case forces terminal immediately but the mechanism is ineffective until max attempts (poll logic dominates).
- These do not re-introduce budget over-consumption, double-charging, or false retry-after-success (the adopt clear + indet path prevents the main stale regression). No platform/runtime breaks; cadence and disjointness preserved.
- Real device + dev_machine/Peer2 confirmation (per original R1) is still the right next step before merge; pure tests + build are not a substitute for live mic silence episodes.

STATUS: CLEAN — planner guards + adopt window clear + watchdog banner ownership close the CR1 consumption and stale-retry paths; residual banner masking is narrow and does not regress budget or core self-heal behavior.