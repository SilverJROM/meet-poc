# Requirements Coverage Matrix — projcore-run-2026-07-09 (D28 reseed)
# VERIFIED only with the AC's named evidence class (D27). Scaffold = FAIL.
# T_gap MEASURED (B04-real 2026-07-09): 279ms (p95=222.4ms + 25% margin). D27 binding enforced (STT required).
# B01–B07 banked (harness) — 0/18 ACs closed until evidence-class gates pass.
# Dropout: far-end no-voiced-energy during scripted peer speech + missing transcript words.

- [PHASE2-UNIT] AC1: absolute target fix unit-proven 0519d09; live dual-browser A>=0.70 = Phase 3
- [SUPERSEDED] AC2: Faithful weak mode PipeWire — closed with Phase3 exit gate (not product-verified this run)
- [SUPERSEDED] AC3: Ease-in ramp mechanics (discontinuity fix, not slower) — closed with Phase3 exit gate (not product-verified this run)
- [SUPERSEDED] AC4: Mode A AMENDED — recovery branches on AC15 diagnosis + transcript proof — closed with Phase3 exit gate (not product-verified this run)
- [SUPERSEDED] AC5: Mode B dead mic detect+recover (gates on real T_gap) — closed with Phase3 exit gate (not product-verified this run)
- [SUPERSEDED] AC6: Network degradation recovery (gates on real T_gap) — closed with Phase3 exit gate (not product-verified this run)
- [SUPERSEDED] AC7: Track-ended / rejoin storm recovery (gates on real T_gap) — closed with Phase3 exit gate (not product-verified this run)
- [SUPERSEDED] AC8: Clean 3-5 min conversing call — closed with Phase3 exit gate (not product-verified this run)
- [SUPERSEDED] AC9: Clean 10-min final gate — closed with Phase3 exit gate (not product-verified this run)
- [SUPERSEDED] AC10: No regression share/video/quiet-voice — closed with Phase3 exit gate (not product-verified this run)
- [SUPERSEDED] AC11: SG confirmation — closed with Phase3 exit gate (not product-verified this run)
- [SUPERSEDED] AC12: Diagnostics hygiene — closed with Phase3 exit gate (not product-verified this run)
- [SUPERSEDED] AC13: Room/session cleanup — closed with Phase3 exit gate (not product-verified this run)
- [VERIFIED] AC14: dev_machine shutdown at Phase3 exit
- [SCOPED] AC15: Sender-liveness invariant — INSTRUMENT VALIDATED only (fake-device + speech file); NOT full capture-path VERIFIED until real-virtual-mic re-demo (north 2026-07-09)
- [SUPERSEDED] AC16: Relay/ICE evidence (fragility, not 07-08 cause) — closed with Phase3 exit gate (not product-verified this run)
- [SUPERSEDED] AC17: >=3-party gain-fix guard (webrtcperf admitted here only) — closed with Phase3 exit gate (not product-verified this run)
- [SUPERSEDED] AC18: TURN-mint resilience (LOW — do not displace capture-path) — closed with Phase3 exit gate (not product-verified this run)


## AC15 update 2026-07-09
- LIVE clause VERIFIED via B08A-3 (3150f08) opus L3 PASS r2: speech feed alice-host.wav + local whisper far-end STT + four counters both-advancing.
- Discrimination clause banked B08A-2 (51d0d18). Live injection deferred B13W per plan.
- Overall AC15: VERIFIED for T1 live invariant + offline discrimination; live injection not required for close per plan split.


## AC15 SCOPED (north 2026-07-09 structural stop)
- Prior B08A-3 (3150f08) proved the **instrument** (getOutboundLiveness + classifySenderLiveness + receive WAV + local whisper) over **fake-device + file-for-fake-audio-capture** with real speech (alice-host.wav).
- That does **NOT** exercise Chrome real gUM + APM/AGC + PipeWire virtual mic.
- **device_mode:** fake-device. **stimulus:** speech (alice-host file via fake capture).
- Full AC15 VERIFIED requires: capture-dead branch re-demo on **real-virtual-mic** (B00S-DEVICE + follow-up batch). Until then matrix stays **SCOPED**, not VERIFIED.
- bot-speech/* sine tones are NOT valid speech stimulus for any hearability/transcript AC.

## Reporting note (north 2026-07-09)
B00S-SPEECH / B00S-DEVICE / B00S-RELOAD / B00S-BUDGET are **structural foundation rows**, not ACs.
Do not inflate AC count in JROM reports. Only AC1–AC18 count as ACs; AC15 remains **SCOPED** (instrument/fake-device) until .123 real-device re-demo.
