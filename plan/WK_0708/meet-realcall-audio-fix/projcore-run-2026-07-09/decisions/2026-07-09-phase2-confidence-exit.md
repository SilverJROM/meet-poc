# Decision — Phase 2 confidence gate (projcore, 2026-07-09)

**Source:** projcore autonomous (authorized by [north] "when Phase 2 PASS, notify for Phase 3 gate")

## Phase 2 delivery (fake-device local)

| Batch | Commit | Outcome |
|---|---|---|
| B00S-BUDGET | d33eb22+8044d45 CAP | VERIFIED |
| P2-LOCAL-01 inventory | — | 143 unit suite green |
| P2-LOCAL-02 AC1 math | 8044d45 | 2-party no-op proven (defect) |
| P2-LOCAL-03 gum r-grid | 73e398a | r∈{0.5…0.05} ±20% fake-device |
| P2-LOCAL-04 INVALID≠PASS | 75d54c4 | 51 unit |
| P2-LOCAL-05 CAP25+driver | 835ee6e | residual CAP + weakSignal hook |
| P2-LOCAL-06 ABS_TARGET | **0519d09** | AC1 product fix unit-proven |

## Confidence

AC1 **local/unit** path is closed for Phase 2:
1. Defect mechanism proven (2-party unity no-op).
2. Fix: absolute target reference 0.5.
3. Stimulus path proven on Chromium fake-device.
4. CAP25 + harness hygiene green.

**Not claimed:** full AC1 live dual-browser A≥0.70 on SFU; AC3 ramp; real-virtual-mic. Those are Phase 3 / later.

## Exit

Phase 2 **confidence PASS** → **notify for Phase 3 gate**. Do **not** auto-start Phase 3. Do **not** shutdown.
