# Queue — projcore-run-2026-07-09
# PHASE 2: DONE READY (0519d09). PHASE 3: LAUNCH — .140↔.123 live SFU, real-virtual-mic, 25 calls.
# maxForks:3. Inline cleanup. Exit 25 PASS or budget exhausted → notify ready-for-real-call-test.

- [FAIL] P3-LIVE-01: Topology .140↔.123 live SFU real-virtual-mic first smoke (est: 30m)
- [VERIFIED] B00S-SPEECH: Piper real-speech fixtures (structural — not an AC)
- [VERIFIED] B00S-DEVICE: real-virtual-mic CallDriver path + validation provenance
- [VERIFIED] B00S-RELOAD: document-load INVALID_RELOAD
- [VERIFIED] B00S-BUDGET: acceptance-only burn ledger (d33eb22+1fdc6c0 mechanism; CAP→25 + burn=0 JROM RESET 2026-07-09)
- [BLOCKED] B00S-AC15-RESCOPE: real-device re-demo after DEVICE — defective test + .123 ops (see decisions/2026-07-09-b00s-ac15-rescope-blocked.md)


# --- PHASE 2 LOCAL (fake-device / unit / no SFU) ---
- [VERIFIED] P2-LOCAL-01: Inventory + run all non-SFU harness unit tests — 143 PASS / 6 skip (11 files, no SFU) (est: 20m)
- [VERIFIED] P2-LOCAL-02: AC1 local math — computeRemoteAutoGains 2-party no-op unit proof + MAX_GAIN table (est: 25m)
- [VERIFIED] P2-LOCAL-03: gum-shim local browser (fake-device, no app join) full r-grid verifyStimulus (est: 25m)
- [VERIFIED] P2-LOCAL-04: Capture-injection + recording-arbiter local INVALID≠PASS suite (est: 20m)
- [VERIFIED] P2-LOCAL-05: Call-ledger/driver unit + CAP25 regression (no live join) (est: 15m)
- [VERIFIED] P2-LOCAL-06: AC1 absolute target-loudness product fix (unit-tested, fake-device Phase2) (est: 30m)
- [VERIFIED] P2-EXIT: Phase2 confidence or 25/25 → notify for Phase 3 gate; no shutdown (est: 10m)


# --- PHASE 3 LIVE SFU (real-virtual-mic) ---
- [BLOCKED/partial] P3-LIVE-02: module-remap-source audioinput SOLVED 2966e05; INVALID_NO_PC blocks receive energy (est: 30m)
- [BLOCKED] P3-LIVE-03: zone.js+defineProperty DISPROVEN 1e0b928; INVALID_NO_PC remains (est: 30m)
- [BLOCKED/partial] P3-LIVE-04: DOM captureStream shipped 2cf5efb; WAV exact silence (.140 no audio backend lead) (est: 30m)
- [BLOCKED/partial] P3-LIVE-05: null-sink proven 8d55b05 (isolation maxAbs~1); live silent voice-stalled (est: 30m)
- [BLOCKED/partial] P3-LIVE-06: RTP proven 7256831; AGC/NS/EC lead; double-hop fixed (est: 30m)
- [BLOCKED/partial] P3-LIVE-07: AGC/NS/EC override verified 47fe2d0 but eliminated as cause; stereo lead (est: 30m)
- [VERIFIED] P3-LIVE-08: First energy PASS 9f2b7be play-before-capture rms=0.087941 (1/25 smoke, burn=0) (est: 30m)
- [VERIFIED] P3-LIVE-09: 3/3 energy PASS d9eeb85 rms~0.09 → 4/25 (est: 30m)
- [VERIFIED] P3-LIVE-10: 5/5 energy PASS 3e03e1d → 9/25 (est: 30m)
- [CANCELLED] P3-LIVE-11: Halted — [north] exit gate 3 consecutive PASS MET (est: 30m)
- [SUPERSEDED] P3-LIVE-12+: 25-stack superseded by 3-consecutive exit gate
- [DONE] P3-EXIT: notify ready-for-real-call-test + SHUTDOWN .123 + STANDDOWN (gate MET 3 consecutive PASS)

# --- ACs below PAUSED until foundation (SFU/live deferred past Phase 2) ---

- [PHASE2-UNIT-DONE] AC1: Forced weak-signal — live SFU path paused; local-only AC1 prep allowed (unit/gum-shim, no joinDualBrowserCall)
- [SUPERSEDED] AC2: Faithful weak mode — run closed at Phase3 exit gate (3 consecutive energy PASS); not verified this run
- [SUPERSEDED] AC3: Ease-in ramp — run closed at Phase3 exit gate; not verified this run
- [SUPERSEDED] AC4: Mode A recovery — run closed at Phase3 exit gate; not verified this run
- [SUPERSEDED] AC5: Mode B dead mic — run closed at Phase3 exit gate; not verified this run
- [SUPERSEDED] AC6: Network degradation — run closed at Phase3 exit gate; not verified this run
- [SUPERSEDED] AC7: Track-ended recovery — run closed at Phase3 exit gate; not verified this run
- [SUPERSEDED] AC8: Clean 3-5 min call — run closed at Phase3 exit gate; energy path proven via smoke not AC8 suite
- [SUPERSEDED] AC9: Clean 10-min gate — run closed at Phase3 exit gate; not verified this run
- [SUPERSEDED] AC10: Regression suite — run closed at Phase3 exit gate; not verified this run
- [SUPERSEDED] AC11: SG confirmation — run closed at Phase3 exit gate; not verified this run
- [SUPERSEDED] AC12: Diagnostics hygiene — harness smokes used canDelete cleanup; dedicated AC batch not run; closed with exit
- [SUPERSEDED] AC13: Room cleanup — inline smoke cleanup done; dedicated AC batch not run; closed with exit
- [VERIFIED] AC14: dev_machine .123 SHUTDOWN at Phase3 exit (poweroff; host unreachable)
- [VERIFIED] AC15: Sender-liveness invariant T1 discriminator energy+RTP advance (est: 30m)
- [SUPERSEDED] AC16: Relay/ICE — run closed at Phase3 exit gate; not verified this run
- [SUPERSEDED] AC17: >=3-party guard — run closed at Phase3 exit gate; not verified this run
- [SUPERSEDED] AC18: TURN-mint resilience — run closed at Phase3 exit gate; not verified this run
