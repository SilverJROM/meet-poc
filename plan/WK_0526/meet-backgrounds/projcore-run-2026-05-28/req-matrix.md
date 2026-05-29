# Req coverage matrix — Phase 2b

| Req# | Requirement (verbatim, first 80 chars) | Batch | Evidence | Status |
|------|---------------------------------------|-------|----------|--------|
| R18 | Segmentation foundation + Blur mode (MediaPipe + canvas pipeline) | B1 | commit 5cdb0af; validation/B1-segmentation-foundation.md; backend+frontend build clean; two-browser join confirms remote sees composite | VERIFIED |
| R19 | 5 generic backgrounds + picker UI | B2 | commit f6f8714; validation/B2-picker-ui.md + lobby+in-call screenshots; assets Option C (gen SVG, CC0); picker standalone with localStorage persistence + keyboard nav | VERIFIED |
| R20 | Custom background upload (localStorage, resize, ≤5 per browser) | B3 | commits fb91c46 + a59043a; validation/B3-custom-upload.md + screenshot showing Custom 1 tile w/ × delete; constants match spec (10MB upload, 1MB processed, JPEG ladder); FIFO + restore + delete-fallback verified; ng build PASS | VERIFIED |
| R21 | Mobile opt-in warning | B4 | commit 0469f64; validation/B4-mobile-optin.md + desktop+mobile screenshots; verbatim warning text; default-off via meet-poc:bg:mobile-opt-in flag; ViewportService injected as signal ref; desktop unchanged | VERIFIED |
| R22 | Phase 2b test gate (builds + e2e + new spec) | B5 | commit 1e55bd6; validation/B5-test-gate.md; 4 gates all PASS (backend build, ng build, fixloop-banner 16/16, background-effects 1/1 in 4.7s independent re-run); spec triple-cleanup pattern + addInitScript localStorage reset + track-id assertions both directions | VERIFIED |

Status legend: UNASSIGNED → ASSIGNED → IN-PROGRESS → CLAIMED → VERIFIED (or FAIL).
