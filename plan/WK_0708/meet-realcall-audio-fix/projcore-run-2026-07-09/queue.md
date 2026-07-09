# Queue — projcore-run-2026-07-09 (OVM dashboard = og-requirements ACs)
# D28 reseed 2026-07-09: AC1–AC18. 0 ACs closed. B01–B07 banked (harness commits) — not ACs.
# Call budget: 0/25. T_gap VOID; T_gap_provisional=500ms wiring only.
# Internal batches: queue-batches.md (re-planned after Phase 0.5).

- [PENDING] AC1: Forced weak-signal sweep — A>=0.70 same-speaker ref; absolute target-loudness fix (est: 30m)
- [PENDING] AC2: Faithful weak mode PipeWire source attenuate A>=0.70 (est: 25m)
- [PENDING] AC3: Ease-in ramp mechanics AudioParam no discontinuity (est: 30m)
- [PENDING] AC4: Mode A recovery branches on AC15 diagnosis + far-end transcript (est: 30m)
- [PENDING] AC5: Mode B dead mic zero detect + recovery (est: 25m)
- [PENDING] AC6: Network degradation tc netem survive/recover within T_gap (est: 30m)
- [PENDING] AC7: Track-ended publish-failure rejoin storm recovery (est: 25m)
- [PENDING] AC8: Clean 3-5 min conversing call .140 <-> .123 (est: 30m)
- [PENDING] AC9: Clean 10-min final gate (est: 30m)
- [PENDING] AC10: No regression screen share + video + quiet-voice (est: 25m)
- [PENDING] AC11: SG confirmation Chromium WAV play only (est: 20m)
- [PENDING] AC12: Diagnostics hygiene delete only harness-created IDs (est: 15m)
- [PENDING] AC13: Room/session cleanup before DONE (est: 10m)
- [PENDING] AC14: dev_machine shut down when done / not in use (est: 5m)
- [PENDING] AC15: Sender-liveness invariant T1 discriminator energy+RTP advance (est: 30m)
- [PENDING] AC16: Relay/ICE gather relay + forced relay-only audio e2e (est: 20m)
- [PENDING] AC17: >=3-party guard gain fix no multi-party regression (est: 25m)
- [PENDING] AC18: TURN-mint resilience loud degrade STUN-only (LOW) (est: 15m)
