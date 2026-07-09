# Queue — projcore-run-2026-07-09 (atomic batches from plan.md custody)
# STATUS markers: PENDING | PROCESSING | VERIFIED | SKIPPED

- [PROCESSING] B01-fix1: Call-budget ledger and cleanup guardrails (est: 20m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=none
- [PENDING] B02: Recording/transcript arbiter and third verdict (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B01
- [PENDING] B03: Fixed-clock conversation harness (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B02
- [PENDING] B04: Baseline two-call `T_gap` derivation (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B03
- [PENDING] B05: Forced weak-signal gUM shim and stimulus verifier (est: 25m)  # impl=L3 val=L3 delib=yes red=yes (standard) deps=B02
- [PENDING] B06: Faithful PipeWire weak-source mode (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B02
- [PENDING] B07: Mode-A/Mode-B capture injection contracts (est: 25m)  # impl=L3 val=L3 delib=yes red=yes (standard) deps=B02
- [PENDING] B08: Forced weak-signal sweep baseline (est: 25m)  # impl=L2 val=L2 delib=no red=no deps=B05
- [PENDING] B09: Remote auto-level 2-party reference / noise-floor fix (est: 25m)  # impl=L3 val=L3 delib=yes red=yes (standard) deps=B08
- [PENDING] B10: AudioParam ramp and asymmetric release (est: 25m)  # impl=L3 val=L3 delib=yes red=yes (standard) deps=B09
- [PENDING] B11: Full forced weak-signal acceptance gate (est: 25m)  # impl=L2 val=L2 delib=no red=no deps=B10
- [PENDING] B12: Faithful weak-mode acceptance gate (est: 20m)  # impl=L2 val=L2 delib=no red=no deps=B11
- [PENDING] B13: Mode A frozen non-zero recovery fix/gate (est: 25m)  # impl=L3 val=L3 delib=yes red=yes (standard) deps=B07
- [PENDING] B14: Mode B dead-mic zero recovery fix/gate (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B07, B04
- [PENDING] B15: Network degradation and true-drop reporting (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B04, B03
- [PENDING] B16: Track-ended, publish-failure, rejoin storm (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B04, B07
- [PENDING] B17: Media regression gate (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B11, B12, B15, B16
- [PENDING] B18: Clean 3-5 minute conversing call (est: 25m)  # impl=L2 val=L3 delib=no red=no deps=B13, B14, B15, B16, B17
- [PENDING] B19: Clean 10-minute final gate (est: 25m)  # impl=L2 val=L3 delib=no red=no deps=B18
- [PENDING] B20: SG confirmation-only leg (est: 20m)  # impl=L2 val=L2 delib=no red=no deps=B19
- [PENDING] B21: Final cleanup, report, and dev_machine shutdown (est: 15m)  # impl=L2 val=L2 delib=no red=no deps=B19 or budget exhausted
