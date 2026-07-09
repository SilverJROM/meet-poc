# Queue - projcore-run-2026-07-09 (D28 realignment)
# STATUS markers: PENDING | PROCESSING | VERIFIED | SKIPPED | VOID
# D28: B01-B07 are banked VERIFIED; 0/18 ACs closed; 0/25 burn.
# D27: B04 code stands, but T_gap=3400ms is VOID; real T_gap is B04-real.
# Co-planner A structural check: B08A split into B08A-1/-2/-3 (AC15 VERIFIED only at -3, on far-end
#   transcript); evidence spine B08S-1/-2 added (no call driver / receive-side recorder exists today);
#   B00F added before B08 (verifyStimulus false-PASSes a dead mic); B13W added before B13 (sender-dead
#   is unreachable from R1's trigger); B08X read-only zero-call archaeology, non-blocking.

- [VERIFIED] B01: Call-budget ledger and cleanup guardrails (est: 20m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=none | commits eada423+b0f2bce+22db4f4
- [VERIFIED] B02: Recording/transcript arbiter and third verdict (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B01 | commits 058af0e+202f156
- [VERIFIED] B03: Fixed-clock conversation harness (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B02 | commit 27a5ef7
- [VERIFIED] B04: T_gap scaffold code only; numeric result void (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B03 | commit 6a16127; T_gap=3400ms VOID; closes no AC
- [VERIFIED] B05: Forced weak-signal gUM shim and stimulus verifier (est: 25m)  # impl=L3 val=L3 delib=yes red=yes (standard) deps=B02 | commit df13135; AC1 open
- [VERIFIED] B06: Faithful PipeWire weak-source mode (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B02 | commits 2850c2a+45c2d7b; AC2 open
- [VERIFIED] B07: Mode-A/Mode-B capture injection contracts (est: 25m)  # impl=L3 val=L3 delib=yes red=yes (standard) deps=B02 | commit 3b19bfa; AC4/AC5 open
- [VERIFIED] B08A-1: AC15a sender-liveness stats reader + diagnostics emit (product code) (est: 25m)  # impl=L3 val=L3 delib=yes red=yes (standard) deps=B07 | FIRST net-new D28 batch; T1 discriminator; new getOutboundLiveness() — totalSamplesDuration + packetsSent/bytesSent do NOT exist on the capture path today; zero calls
- [VERIFIED] B08A-2: AC15b capture-vs-sender discriminator + dual injection (est: 25m)  # impl=L3 val=L3 delib=yes red=yes (standard) deps=B08A-1 | sender-dead injection = setParameters({encodings:[{active:false}]}); replaceTrack(null)/track.enabled=false are WRONG; closes AC15 DISCRIMINATION clause only — AC15 NOT VERIFIED here; zero calls
- [PENDING] B08X: T1 archaeology on banked session 652c1475 (est: 20m)  # impl=L2 val=L2 delib=no red=no deps=none | READ-ONLY, zero calls, parallel, INCONCLUSIVE acceptable, GATES NOTHING; never delete/mutate 652c1475
- [VERIFIED] B00F: Harness-integrity fixes B05 F2/F4 (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B05,B02 | F2 verifyStimulus false-PASSes a dead mic — MUST precede B08 sweep; F4 call-ledger tests register zero vitest suites
- [PROCESSING] B08S-1: Evidence spine 1/2 — dual-browser call driver (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B03,B01 | no call driver exists; adapt e2e/scripts legacy tooling; unblocks EVERY live AC
- [PENDING] B08S-2: Evidence spine 2/2 — receive-side recorder + transcript adapter (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B08S-1,B02 | legacy records .webm, arbiter parses WAV; app recorder /upload is owner/session-gated and rejects SILENTLY — harness must capture receive-side itself
- [PENDING] B08A-3: AC15c live sender-liveness invariant (est: 25m)  # impl=L3 val=L3 delib=yes red=yes (standard) deps=B08A-2,B08S-2 | AC15 VERIFIED ONLY HERE, on far-end transcript + all four counters advancing; burns 1
- [PENDING] B04-real: Real dual-browser T_gap derivation (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B08S-2,B03 | burns 2/25; replaces provisional 500ms wiring; B14/B15/B16 re-verify
- [PENDING] B08: Forced weak-signal sweep baseline (est: 25m)  # impl=L2 val=L2 delib=no red=no deps=B05,B00F,B08S-2 | A=same-speaker normal-vs-attenuated; pre-fix expect A~=r
- [PENDING] B09: Absolute target-loudness gain fix plus AC17 guard (est: 25m)  # impl=L3 val=L3 delib=yes red=yes (standard) deps=B08 | never local publisher; never loudest-remote
- [PENDING] B10: AudioParam ramp and asymmetric release (est: 25m)  # impl=L3 val=L3 delib=yes red=yes (standard) deps=B09 | closes AC3; TRAP: applyVolumeState is the single writer for mute+volume+autoGain — ramp ONLY autoGain or mute regresses to ~2.5s; relax AUTO_LEVEL_SMOOTHING=0.35 (no double-smoothing)
- [PENDING] B11: AC1 forced weak-signal acceptance gate (est: 25m)  # impl=L2 val=L2 delib=no red=no deps=B10
- [PENDING] B12: AC2 faithful weak-mode acceptance gate (est: 20m)  # impl=L2 val=L2 delib=no red=no deps=B11,B06
- [PENDING] B13W: AC4a sender-liveness watchdog + trigger (product code) (est: 25m)  # impl=L3 val=L3 delib=yes red=yes (standard) deps=B08A-3 | D4: classifyMicCapture returns 'working' whenever capture energy advances, so R1 NEVER FIRES on sender-dead — 856104f is blind there, not wrongly-remedied; detection+telemetry only, no remedy
- [PENDING] B13: AC4b Mode A branch-on-diagnosis recovery (est: 25m)  # impl=L3 val=L3 delib=yes red=yes (standard) deps=B13W,B07 | capture-dead->mic reacquire (R1); sender-dead->replaceTrack/renegotiate/ICE restart (restartIce + full-republish already exist, sfu-client:1082,:459 — wire, don't build); closes AC4
- [PENDING] B14: AC5 Mode B dead-mic zero recovery (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B04-real,B07
- [PENDING] B15: AC6 network degradation and true-drop reporting (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B04-real,B03
- [PENDING] B16: AC7 track-ended, publish-failure, rejoin storm (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B04-real,B07,B13W
- [PENDING] B16R: AC16 relay fragility gate (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B11,B13 | cheap fragility, not root cause
- [PENDING] B17: Media regression gate (est: 25m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B11,B12,B15,B16
- [PENDING] B18: Clean 3-5 minute conversing call (est: 25m)  # impl=L2 val=L3 delib=no red=no deps=B13,B14,B15,B16,B16R,B17
- [PENDING] B19: Clean 10-minute final gate (est: 30m)  # impl=L2 val=L3 delib=no red=no deps=B18 | 95/5 carve-out: 10min runtime + recording/transcript analysis
- [PENDING] B20: SG confirmation-only leg (est: 20m)  # impl=L2 val=L2 delib=no red=no deps=B19
- [PENDING] B20T: AC18 TURN-mint resilience (est: 20m)  # impl=L2 val=L2 delib=no red=yes (budget) deps=B16R | LOW priority; loud degradation only
- [PENDING] B21: Final cleanup, report, and dev_machine shutdown (est: 15m)  # impl=L2 val=L2 delib=no red=no deps=B19,B20,B20T or budget exhausted
