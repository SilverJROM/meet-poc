---
name: watcher-deadlock-recovery-2026-07-10
description: Recovered from collateral watcher death when Helm killed broad watcher pids; re-armed loop
metadata:
  type: incident
  date: 2026-07-10T06:35:00+00:00
  source: north (responding to Helm notice)
  priority: high
---

# Watcher Deadlock Recovery — 2026-07-10 06:35 UTC

## Incident

Helm run (x-02_projcore_grok45_helm) reaped 128 projcore-watcher loops at ~06:22Z to stop a runaway. Reaping filter used batch-id only (not run_dir), so collaterally killed watchers from OTHER runs including this one (meet-poc run-2026-07-09).

**Risk:** Silent deadlock — if P3-LIVE-04 implementer finished and emitted callback, no watcher was alive to detect it → coordinator stalled at prompt, callback lost.

## Recovery Actions Taken

1. **Watcher alive check:** `ps -eo args | grep [p]rojcore-watcher | grep projcore-run-2026-07-09`
   - Result: **ZERO** (watcher dead, confirmed)

2. **Re-arm watcher:** Launched fresh projcore-watcher.sh for P3-LIVE-04 (batch_id, role=implementer, session=x-01_impl_sonnet_meet)
   - Watcher PID was 2465012 (dead)
   - New watcher re-armed 2026-07-10T06:35:00Z

3. **OVM re-register:** `overmind.sh register --run-dir <abs>`
   - Result: wf=136 (valid, not stale)

## Root Cause Pattern (per Helm)

Helm accumulated 123 immortal watcher loops via hand-rolled `nohup bash -c 'while true; do watcher; sleep 5; done'` — no PID reaping. Drove load to 36, wrote 471,349 sync lines (40MB) to progress.md.

**Fix:** Always use `projcore-dispatch.sh start`, which kills prior watcher PID before launching fresh one (fail-closed PID management).

## Status

- Watcher: **RE-ARMED** ✓
- OVM: **VALID** ✓
- P3-LIVE-04: Awaiting callback or timeout ✓
- Silent deadlock: **PREVENTED** ✓

source: [north] incident response 2026-07-10
