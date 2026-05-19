# M-B6 Test Report

## Live Smoke

- `curl -s https://voice.silverjrom.app/ | sed -n '1,40p'` — PASS
- Evidence: response contains Angular root `<app-root></app-root>` and `viewport-fit=cover`.

## Lighthouse Mobile Baseline

- `./scripts/lighthouse-mobile.sh` — PASS
- Target: `https://voice.silverjrom.app/login`
- Outputs:
  - `batch-6/lighthouse/lighthouse-mobile-baseline.json`
  - `batch-6/lighthouse/lighthouse-mobile-baseline.html`

Scores:
- Performance: 77
- Accessibility: 95
- Best Practices: 100
- SEO: 82

Key metrics:
- FCP: 3.5 s
- LCP: 4.3 s
- TBT: 10 ms
- CLS: 0

Finding: Performance and SEO are below the ideal acceptance target. Per the M-B6 brief, Lighthouse misses are recorded as baseline findings and are not an automatic blocker for operator-prep completion.

## Proxy Screenshots

- `node scripts/capture-mb6-proxy-screenshots.mjs` — PASS
- Captured 21 screenshots under `batch-6/screenshots/`.
- Viewports covered: iPhone 14 portrait, Pixel 7 portrait, desktop 1920x1080.
- Screenshots verified as PNG files with expected dimensions using `file batch-6/screenshots/*.png`.

## Run 1 Desktop Regression Gate

- `npm test -w e2e -- tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1` — PASS, 40/40

## Not Run By Codex

- Real iPhone Safari smoke.
- Real Android Chrome smoke.
- Real two-device, two-minute media continuity test.

Those checks are intentionally operator-assisted and are covered by `OPERATOR_SMOKE.md`.
