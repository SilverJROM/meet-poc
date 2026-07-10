# Phase 3 counter — live SFU .140↔.123 (target **25**)

| # | Batch | Result | P3 PASS | burns | free-h | Notes |
|---|-------|--------|---------|-------|--------|-------|
| 1 | P3-LIVE-01 | **FAIL/BLOCKED** 666fd22 | 0/25 | 0 | total=61Gi used=32Gi free=12Gi avail=29Gi | CDP harness landed; .123 headless 0 audioinput |
| 2 | P3-LIVE-02 | **BLOCKED** (pending commit) | 0/25 | 0 | total=61Gi used=31Gi free=12Gi avail=29Gi | Xvfb hypothesis DISPROVEN; real fix=module-remap-source (audioinput solved, both ways). Both legs join+publish live (server-confirmed); receive-side capture hook sees 0 PCs (INVALID_NO_PC, new issue, not Xvfb-related) — see decisions/2026-07-10-p3-live-02-invalid-no-pc.md |

Exit still: 25 PASS or budget exhausted → notify ready-for-real-call-test + SHUTDOWN + STANDDOWN
