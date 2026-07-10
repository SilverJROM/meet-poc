# Phase 3 counter — live SFU .140↔.123 real-virtual-mic (target **25**)

**Authority:** [north] CORRECTION LAUNCH 2026-07-10  
**Base:** `0519d09` ABS_TARGET  
**Exit:** 25 PASS or budget exhausted → notify DONE ready-for-real-call-test

| # | Batch | Result | P3 | burns | free-h | Notes |
|---|-------|--------|-----|-------|--------|-------|
| 0 | open | — | 0/25 | 0 | total=61Gi used=36Gi free=8.7Gi avail=25Gi | launching |
| 1 | P3-LIVE-01 | BLOCKED | 0/25 | 0 | total=61Gi used=33Gi free=11Gi avail=27Gi | Topology proven (CDP-remote split-host, SSH tunnel, 2 real bugs found+fixed: insecure-origin getUserMedia block, silent-mic-before-play). Blocked on: .123 headless Chrome enumerates 0 audioinput devices even with XDG_RUNTIME_DIR+PULSE_SERVER set (tried --headless=new/old). See validation/p3-live-01-changes.md for recommended next step (Xvfb, or fake-device fallback for hearability, or dedicated follow-up batch). |


## FINAL EXIT PROCEDURE ([north] locked)

On 25 PASS **or** budget exhausted:
1. Notify JROM `ready-for-real-call-test`
2. SHUTDOWN dev_machine
3. STANDDOWN all ops — no auto-restart
4. JROM owns real-call test
