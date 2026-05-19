# Validation — v3-M-B1 (Mobile foundations)

**Verdict:** **PASS** (iter 1, clean — codex committed BEFORE STATUS: DONE per the v3 hard-reminder rule).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.

## Gate 1 — Artifacts

All present. 1 decision (`scss-includepaths` — codex picked Angular include paths). 6 real screenshots (mobile + desktop, lobby + call, touch-targets close-ups).

## Gate 2 — Diff review

2 atomic feature commits + my dispatch-context commit:
```
d781da5 test: add M-B1 foundation specs
7fc4453 feat: add mobile foundation services and dvh breakpoints
c2d3f1c docs: add v3 mobile dispatch context  (housekept by codex before branching)
```

Branch `feat/meet-v3-mb1-foundations` is on `c2d3f1c` → `7fc4453` → `d781da5`. Process discipline restored — commits before callback. Small residue post-commit (callbacks.md/progress.md modified + batch-1/ untracked) is the standard callback-write protocol artifact, not a gap.

Key surfaces touched:
- `frontend/src/styles/_breakpoints.scss` — new partial with `$mobile-max: 1023px`, mixins `mobile`/`desktop`/`max`/`between`
- `frontend/angular.json` — `stylePreprocessorOptions.includePaths: ["src/styles"]`. Codex's strategy (option a) — every component SCSS can `@use 'breakpoints' as bp;` without relative paths.
- `frontend/src/index.html` — `viewport-fit=cover` added to viewport meta tag (verified live: `width=device-width, initial-scale=1, viewport-fit=cover`)
- `frontend/src/app/services/viewport.service.ts` — new; `isMobile` signal w/ 250ms debounce on resize
- `frontend/src/app/services/platform.service.ts` — new; `isIOS()` + `isAndroid()` + `isMobileUA()` signals (moved here from M-B6 per Codex review)
- App SCSS — `100vh` + `calc(100vh - …)` paired with `100dvh` fallbacks (verified in `login.page.scss`: `min-height: 100vh; min-height: 100dvh;` pattern); 4 files / 8 sites total per codex's audit table
- Mobile-only 48px touch targets applied via `bp.mobile { … }` mixin to lobby + call controls + sidebar + leave dialog + meeting-ended toast. Desktop 46px (from B7) preserved.
- `e2e/tests/v3-mb1-foundations/mobile-foundations.spec.ts` — 4 tests covering the M1.1-M1.4 scenario set

## Gate 3 — Build

`npm run build -w frontend` PASS + `npm run build` PASS. No tsc errors after the new Angular service files + SCSS include path change.

## Gate 4 — Targeted + regression tests

- **Backend regression: 17/43 PASS** (unchanged — M-B1 didn't touch BE)
- **Run 1 desktop e2e regression: 40/40 PASS** in 1.0m with `--workers=1` (R8.1 GATE GREEN — the critical regression check)
- **M-B1 mobile e2e: 4/4 PASS** in 3.7s

This is the first time the R8.1 mandate (full Run 1 desktop e2e at every M-B* gate) was enforced. PASS on first try means the foundations changes are non-leaky into desktop.

## Gate 5 — Evidence quality (5Q)

- Q1 ✓ Real DOM at both viewports (Playwright `setViewportSize(390, 844)` + `setViewportSize(1920, 1080)`)
- Q2 ✓ Right level — foundations is config/scss/services so audit-level proof + signal-state proof is correct
- Q3 ✓ 6 screenshots match claims (mobile lobby + mobile call w/ touch-target close-ups + desktop regression baselines)
- Q4 ✓ 5 scenarios = 4 test cases (codex bundled S1.1 + S1.3 in one test M1.1 because both are static-file audits — acceptable)
- Q5 ✓ Live URL serves; viewport-fit=cover live; `__meetDebug.isMobile()` exposed (verified by M1.2 spec)

### Live verification

```
grep -rE "100vh|calc\(100vh" frontend/src/app/  → all matches are paired with 100dvh fallback (verified in login.page.scss)
curl https://voice.silverjrom.app/  → HTTP/2 200; viewport meta has viewport-fit=cover
```

### Hygiene

Codex's M-B1 spec runs didn't create rooms/sessions (no test pollution from M-B1 itself). My regression rerun added 14 B6GRID rooms + 16 sessions which I cleaned via SQL post-validation. Rooms back to TEST_ROOM01; sessions = 0.

## Gate 6 — Matrix update

R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R1.7, R1.8 → **VERIFIED**. R8.1 (gate) for M-B1 → **VERIFIED** (Run 1 desktop e2e remains 40/40). R8.2 desktop-unaffected spec for M-B1 → **VERIFIED** (M1.4 test).

## Gate 7 — Decisions

`scss-includepaths` decision logged. Angular include paths chosen — cleaner than per-file relative `@use`. Reasonable autonomous call.

## Verdict

**PASS** — 10 reqs VERIFIED (R1.1-R1.8 + R8.1 + R8.2 for M-B1). **Matrix: 10/30 VERIFIED.** Foundations solid; mobile/desktop split is non-leaky. Cleared for M-B2 (WebRTC adjustments).
