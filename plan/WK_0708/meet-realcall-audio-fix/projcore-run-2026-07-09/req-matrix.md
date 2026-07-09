# Requirements Coverage Matrix — projcore-run-2026-07-09 (D28 reseed)
# VERIFIED only with the AC's named evidence class (D27). Scaffold = FAIL.
# T_gap real: pending B04 re-run. Provisional 500ms wiring only.
# B01–B07 banked (harness) — 0/18 ACs closed until evidence-class gates pass.
# Dropout: far-end no-voiced-energy during scripted peer speech + missing transcript words.

- [PENDING] AC1: Forced weak-signal sweep (absolute target loudness; A=same-speaker; pre-fix A≈r)
- [PENDING] AC2: Faithful weak mode PipeWire
- [PENDING] AC3: Ease-in ramp mechanics (discontinuity fix, not slower)
- [PENDING] AC4: Mode A AMENDED — recovery branches on AC15 diagnosis + transcript proof
- [PENDING] AC5: Mode B dead mic detect+recover (gates on real T_gap)
- [PENDING] AC6: Network degradation recovery (gates on real T_gap)
- [PENDING] AC7: Track-ended / rejoin storm recovery (gates on real T_gap)
- [PENDING] AC8: Clean 3-5 min conversing call
- [PENDING] AC9: Clean 10-min final gate
- [PENDING] AC10: No regression share/video/quiet-voice
- [PENDING] AC11: SG confirmation
- [PENDING] AC12: Diagnostics hygiene
- [PENDING] AC13: Room/session cleanup
- [PENDING] AC14: dev_machine shutdown
- [PENDING] AC15: Sender-liveness invariant (T1 discriminator — sequence EARLY)
- [PENDING] AC16: Relay/ICE evidence (fragility, not 07-08 cause)
- [PENDING] AC17: >=3-party gain-fix guard (webrtcperf admitted here only)
- [PENDING] AC18: TURN-mint resilience (LOW — do not displace capture-path)
