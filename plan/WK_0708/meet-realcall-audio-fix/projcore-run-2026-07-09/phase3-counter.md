# Phase 3 counter — live SFU .140↔.123 (target **25** PASS, burn CAP=25)

| # | Batch | Result | P3 PASS | burns | free-h | Notes |
|---|-------|--------|---------|-------|--------|-------|
| 1 | P3-LIVE-01 | **FAIL/BLOCKED** 666fd22 | 0/25 | 0 | avail~29Gi | CDP harness; 0 audioinput |
| 2 | P3-LIVE-02 | **BLOCKED-partial** 2966e05 | 0/25 | 0 | | remap-source audioinput fix |
| 3 | P3-LIVE-03 | **BLOCKED** 1e0b928 | 0/25 | 0 | | zone.js/defineProperty disproven |
| 4 | P3-LIVE-04 | **BLOCKED** 2cf5efb | 0/25 | 0 | | DOM captureStream; silence |
| 5 | P3-LIVE-05 | **BLOCKED** 8d55b05 | 0/25 | 0 | | null-sink proven; live silent |
| 6 | P3-LIVE-06 | **BLOCKED** 7256831 | 0/25 | 0 | | RTP proven; AGC lead |
| 7 | P3-LIVE-07 | **BLOCKED** 47fe2d0 | 0/25 | 0 | | AGC/NS/EC eliminated |
| 8 | P3-LIVE-08 | **PASS** 9f2b7be | **1/25** | 0 | avail~28Gi | play-before-capture; rms=0.087941 (smoke, no burn) |
| 9 | P3-LIVE-09 | **PASS x3** (no code) | **4/25** | 0 | avail~27-28Gi | 3 sequential smokes, unchanged mechanism; rms 0.0886/0.0912/0.0905, all independently PCM-verified; 0 FAILs |

Exit: 25 PASS or budget exhausted → notify ready-for-real-call-test + SHUTDOWN + STANDDOWN
