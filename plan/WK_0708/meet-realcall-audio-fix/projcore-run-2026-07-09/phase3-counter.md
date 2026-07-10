# Phase 3 counter — live SFU .140↔.123 (target **25**)

| # | Batch | Result | P3 PASS | burns | free-h | Notes |
|---|-------|--------|---------|-------|--------|-------|
| 1 | P3-LIVE-01 | **FAIL/BLOCKED** 666fd22 | 0/25 | 0 | total=61Gi used=32Gi free=12Gi avail=29Gi | CDP harness landed; .123 headless 0 audioinput |
| 2 | P3-LIVE-02 | **BLOCKED-partial** 2966e05 | 0/25 | 0 | total=61Gi used=31Gi free=12Gi avail=29Gi | Xvfb hypothesis DISPROVEN; real fix=module-remap-source (audioinput solved, both ways). Both legs join+publish live (server-confirmed); receive-side capture hook sees 0 PCs (INVALID_NO_PC, new issue, not Xvfb-related) — see decisions/2026-07-10-p3-live-02-invalid-no-pc.md |
| 3 | P3-LIVE-03 | **BLOCKED** (no code shipped) | 0/25 | 0 | total=61Gi used=31Gi free=12Gi avail=29Gi | zone.js lead DISPROVEN (patch never reassigns the global; plugin not even loaded). `defineProperty(configurable:false)` tested live, also fails — descriptor itself resets to native defaults mid-call. Reload/crash/iframe all ruled out. Real bootstrap-time culprit still unknown; needs raw-CDP-level instrumentation next — see decisions/2026-07-10-p3-live-02-invalid-no-pc.md (2026-07-10 P3-LIVE-03 follow-up) |

Exit still: 25 PASS or budget exhausted → notify ready-for-real-call-test + SHUTDOWN + STANDDOWN
