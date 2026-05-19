# M-B6 Changes

## Scope

M-B6 is operator-assisted acceptance prep. No frontend or backend application code was changed.

## Added

- Root `OPERATOR_SMOKE.md` with a 15-step real-device smoke checklist for JROM.
- Root `OPERATOR_HANDOFF.md` with Run 3 acceptance summary, artifact map, and defers.
- `scripts/lighthouse-mobile.sh` for repeatable Lighthouse mobile baseline runs.
- `scripts/lighthouse-mobile-fallback.mjs` as a Node API fallback when `npx` is unavailable.
- `scripts/capture-mb6-proxy-screenshots.mjs` for Playwright viewport proxy captures against the live URL.
- `batch-6/lighthouse/` with Lighthouse JSON and HTML baseline outputs.
- `batch-6/screenshots/` with 21 screenshots across iPhone 14, Pixel 7, and desktop viewports.
- `batch-6/operator-screenshots/` as the reserved folder for JROM real-device screenshots.
- `decisions/2026-05-19-v3-mb6-operator-acceptance-baseline.md`.

## Notes

- The Lighthouse runner now uses repo Playwright Chromium as `CHROME_PATH` when the host does not expose a system Chrome.
- Playwright proxy screenshots are explicitly evidence aids only; R6.5, R7.1, R7.3, and R7.5 remain real-device/operator acceptance gates.
