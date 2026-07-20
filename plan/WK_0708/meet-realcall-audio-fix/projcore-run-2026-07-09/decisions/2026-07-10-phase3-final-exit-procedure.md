# Decision — Phase 3 FINAL EXIT PROCEDURE ([north], 2026-07-10)

**Source:** [north]
**Quote:** "FINAL EXIT PROCEDURE: When Phase 3 completes (25 PASS or budget exhausted): (1) Notify JROM 'ready-for-real-call-test' (2) SHUTDOWN dev_machine (3) STANDDOWN all operations. No auto-restart. JROM does own real-call test."

## Binding exit sequence (only when Phase 3 ends)

1. **Notify JROM** with completion wording **`ready-for-real-call-test`** (notification protocol verdict-led; TG DONE).
2. **SHUTDOWN dev_machine** — graceful WoL-safe poweroff of the Phase-3 peer machine per project_specs / AC14 (`.123` / silverjrom path as used in this run).
3. **STANDDOWN all operations** — kill only this run's team sessions, OVM `complete`, cancel recurring check-ins for this run, no further dispatches.
4. **No auto-restart** of agents, PM2 meet-poc, or Phase 3 loops after standdown.
5. **JROM does own real-call test** — agents do not substitute or continue after notify.

## Trigger

Phase 3 complete = **25 PASS** **or** **budget exhausted** (CAP acceptance burns), whichever first.

## Not for now

Do not execute this procedure until Phase 3 exit condition is met. P3-LIVE-01+ still in flight.
