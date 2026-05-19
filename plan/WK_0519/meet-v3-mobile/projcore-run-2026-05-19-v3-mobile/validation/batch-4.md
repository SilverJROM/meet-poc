# Validation — v3-M-B4 (Mobile lobby)

**Verdict:** **PASS** (iter 1, clean — commit-before-DONE held 4 consecutive batches).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.

## Gate 1 — Artifacts

All present. 1 decision (`lobby-audiocontext-facingmode` covering all 3 sub-decisions: gate strategy + facingMode precedence + pill UX). 5 real screenshots.

## Gate 2 — Diff review

4 atomic commits:
```
ab54358 docs: add M-B4 evidence artifacts
0241fda test: add M-B4 lobby specs
e5b49b9 feat: add mobile lobby camera switch and mic gate
e25f60d docs: record M-B3 validation and M-B4 dispatch context
```

Codex's two key autonomous calls (good ones):
1. **AudioContext gate scoped to mobile only** (vs my brief's "apply uniformly" suggestion) — desktop keeps Run 1 auto-start behavior, zero risk of desktop regression. Smart trade-off; aligns with the "default-to-desktop-behavior" R1.5 principle.
2. **`facingMode` takes precedence; `deviceId` omitted on flip** — avoids browser conflicts where the two constraints can fight each other on some Chromium versions. Standard pattern; documented in `facingMode handling` table.

Surfaces touched:
- `media.service.ts` — `audioContextActivated` state; mobile defers `AudioContext` creation until `activateMicPreview()`; desktop unchanged; AudioContext kept alive across reacquires post-activation
- `lobby-preview` — mobile-only Flip camera icon button inside video preview; "Tap to enable mic preview" pill when not activated; mobile single-column selectors via `bp.mobile`
- `room.page.ts` — `currentFacingMode` signal; flip handler toggles + reacquires; `__meetDebug.audioContextActivated` + `__meetDebug.currentFacingMode` exposed for tests
- `e2e/tests/v3-mb4-lobby/lobby-mobile.spec.ts` — 4 tests in one spec file

## Gate 3 — Build

PASS.

## Gate 4 — Targeted + regression

- **Backend regression: 45/45** unchanged
- **M-B4 e2e: 4/4** in 6.4s on independent rerun
- **Run 1 desktop regression: 40/40** in 1.1m — R8.1 gate held **4 consecutive M-B* batches**
- **M-B3 regression: 9/9** (codex's own check)

## Gate 5 — Evidence quality (5Q)

- Q1 ✓ Real DOM at 390×844 + 1920×1080
- Q2 ✓ Constraint-object assertions for facingMode (correct per Claude-peer fake-media catch); `__meetDebug.audioContextActivated` for gate verification
- Q3 ✓ 5 screenshots cover all states: with-pill, after-tap, camera-switch, desktop-no-switch, mobile-selectors-stacked
- Q4 ✓ 3 scenarios = 4 tests (S3.1 split into mobile-present + desktop-absent)
- Q5 ✓ Live URL serves with the mobile lobby changes; M-B4 specs PASS independently

## Gate 6 — Matrix update

R3.1, R3.3, R3.4 → **VERIFIED**. R8.1 + R8.2 for M-B4 → **VERIFIED**.

## Gate 7 — Decisions

Single consolidated decision file covering all three M-B4 sub-decisions. Acceptable consolidation.

## Verdict

**PASS** — 3 reqs newly VERIFIED. **Matrix: 27/30 VERIFIED.** Only M-B5 (iOS specifics) + M-B6 (real-device acceptance) remain. Run 3 implementation nearly complete.
