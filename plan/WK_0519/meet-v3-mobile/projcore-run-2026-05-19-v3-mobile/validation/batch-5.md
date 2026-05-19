# Validation — v3-M-B5 (iOS Safari specifics)

**Verdict:** **PASS** (iter 1, clean — commit-before-DONE held 5 consecutive batches).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.

## Gate 1 — Artifacts

All present. 1 decision (`ios-recorder-orientation`). 2 screenshots (landscape evidence).

## Gate 2 — Diff review

5 atomic commits:
```
7cd1e19 docs: add M-B5 evidence artifacts
c6b6319 test: add M-B5 iOS specs
8c5feab feat: add mobile landscape lobby audit fixes
7f3d3bd feat: add recorder mime fallback and iOS timeslice
2f14ce0 docs: record M-B4 validation and M-B5 dispatch context
```

Notable: codex's landscape orientation audit FOUND a real problem (lobby preview clipped at 844×390 mobile-landscape) and FIXED it with a landscape-specific two-column lobby layout. Two `feat:` commits in this batch — the second one (`landscape lobby audit fixes`) is the result of running the audit and finding something. Honest reporting, real fix.

Surfaces touched:
- `frontend/services/recorder.service.ts` — mime capability list (5 candidates) + `X-Ext` header with selected extension + iOS-branch no-timeslice on `MediaRecorder.start()`
- `frontend/pages/room/room.page.ts` — `__meetDebug.lastRecordingMime` + `lastRecordingExtension` + `lastRecorderTimeslice` + `lastRecordingUpload` exposed for tests
- `backend/recording/index.ts` — list/download accept `.webm` + `.mp4` + `.aac`; filename parser accepts arbitrary safe alphanumeric extension; download Content-Type set per extension
- `backend/tests/recording.test.ts` — new test cases for mp4 upload + list + download
- `room.page.scss` + `lobby-preview.scss` — landscape-specific compact layout (the audit-found fix)
- `e2e/tests/v3-mb5-ios/*` — 3 tests using a fake MediaRecorder shim for deterministic mime/timeslice assertions + landscape viewport visibility

## Gate 3 — Build

PASS — backend tsc + Angular build clean.

## Gate 4 — Targeted + regression

- **Backend regression: 46/46 PASS** (was 45/45; +1 file +1 test for mp4 upload coverage)
- **M-B5 e2e: 3/3** in 2.9s
- **M-B4 regression: 4/4** (codex's own check)
- **Run 1 desktop regression: 40/40 PASS** in 1.1m — R8.1 gate held **5 consecutive M-B* batches** ✓

The 5-in-a-row R8.1 streak is the strongest evidence yet that mobile changes are non-leaky into desktop.

## Gate 5 — Evidence quality (5Q)

- Q1 ✓ Real DOM + fake-MediaRecorder shim for deterministic capability-list testing (necessary — can't reliably mock `MediaRecorder.isTypeSupported` in headless Chromium otherwise)
- Q2 ✓ Mime-fallback + timeslice are debug-hook assertions (correct — these are runtime properties not DOM-observable)
- Q3 ✓ Landscape screenshots evidence the actual fix
- Q4 ✓ 3 scenarios = 3 tests (S6.2 mime + S6.6 timeslice + S6.7 landscape)
- Q5 ✓ Live URL serves; mp4 upload tested via backend supertest + live mp4 list/download path

### Hygiene

Codex's M-B5 specs cleaned up. My regression rerun was no-pollute (test design).

## Gate 6 — Matrix update

R6.3, R6.6, R6.7 → **VERIFIED**. R6.5 (100dvh handles iOS address bar) — still verified-via-real-device at M-B6.

## Gate 7 — Decisions

1 decision file covers all 3 sub-decisions (mime ordering + timeslice strategy + landscape audit finding).

## Verdict

**PASS** — 3 reqs newly VERIFIED. **Matrix: 30/30 implementation reqs VERIFIED** (R6.5 + R7.x are real-device gates at M-B6). All implementation done. Final batch M-B6 is operator-assisted real-device acceptance + Phase 2 fresh-context validator.
