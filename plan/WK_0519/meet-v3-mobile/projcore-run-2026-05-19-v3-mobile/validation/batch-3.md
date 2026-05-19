# Validation — v3-M-B3 (Mobile call layout)

**Verdict:** **PASS** (iter 1, clean — commit-before-DONE held).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.

## Gate 1 — Artifacts

All present. 1 decision (`call-layout-strategy` documenting bottom-sheet=extend-existing, iOS-keyboard=close-on-focus, tap-tabs=local activeSection signal). **8 real screenshots** covering all scenarios + desktop-regression baselines.

## Gate 2 — Diff review

4 atomic commits:
```
2b1a472 docs: add M-B3 evidence artifacts
34052de test: add M-B3 call layout specs
11883c3 feat: add mobile call layout
506e0e7 docs: record M-B2 validation and M-B3 dispatch context
```

Codex extended `<app-participant-sidebar>` rather than creating a sibling — single component, branches via `viewport.isMobile()` + CSS. Cleaner than my "or new component" option.

Surfaces touched:
- `participant-sidebar` — mobile mode: 75dvh bottom-sheet, backdrop, drag-handle bar, swipe-down dismiss, tap tabs for host (In-the-call / Waiting); auto-close on input focus inside sheet (iOS keyboard handling)
- `controls-bar` — `bp.mobile`: `position:fixed; bottom:0` + safe-area-inset + horizontal overflow protection; screen-share button conditional `@if (!viewport.isMobile())`
- `room.page.{ts,scss}` — `.tiles-grid[data-count]` mobile overrides: 1=full call area, 2=vstack, 3-4=2x2 (mobile uses 2 cols anyway since cap is 4); bottom padding for docked controls
- `tile.component.scss` — mobile sizing guards so overlays stay readable
- `e2e/tests/v3-mb3-call-layout/*` — 2 spec files / 9 tests

iOS keyboard handling choice (Codex's autonomous call): close sheet on input focus (option a from the brief). Simpler than visualViewport repositioning; acceptable for v3.

## Gate 3 — Build

PASS. Backend tsc + Angular ng build clean.

## Gate 4 — Targeted + regression

- **Backend regression: 45/45** (unchanged — no BE changes in M-B3)
- **M-B3 e2e: 9/9** in 11.0s
- **Run 1 desktop regression: 40/40 PASS** in 1.1m

**R8.1 gate has now held for THREE consecutive M-B* batches** (M-B1, M-B2, M-B3). Strong evidence the mobile/desktop split is non-leaky.

## Gate 5 — Evidence quality (5Q)

- Q1 ✓ Real DOM via Playwright at both 390×844 and 1920×1080 in parallel specs
- Q2 ✓ Layout/CSS proofs use `boundingBox()` measurements + DOM presence assertions (correct level)
- Q3 ✓ 8 screenshots match claims; includes paired "mobile vs desktop" comparisons (screen-share-hidden-mobile.png + screen-share-visible-desktop.png; mobile-controls-docked.png + desktop-controls-top.png; mobile-bottom-sheet-open.png + desktop-sidebar-still-right.png)
- Q4 ✓ 8 scenarios from S2.x = 9 test cases (some scenarios split into multiple tests)
- Q5 ✓ Live URL serves; deployed via `pm2 restart meet-poc-fe`

### Hygiene

Codex's M-B3 spec runs didn't pollute prod DB. My regression rerun added 15 rooms + 16 sessions → cleaned via SQL post-validation.

## Gate 6 — Matrix update

R2.1, R2.2, R2.3, R2.4, R2.5, R2.6, R2.7 → **VERIFIED**. R8.1 + R8.2 + R8.5 for M-B3 → **VERIFIED** (Run 1 regression + paired desktop-unaffected specs + screenshots).

## Gate 7 — Decisions

1 decision file with 3 sub-decisions (component-extension, iOS-keyboard-close-on-focus, tap-tabs-local-signal). Acceptable consolidation; all three are bottom-sheet-related.

## Verdict

**PASS** — 7 reqs newly VERIFIED. **Matrix: 24/30 VERIFIED.** Cleared for M-B4 (mobile lobby — camera switch + AudioContext gesture-gated meter — the Claude-peer critical iOS catch).
