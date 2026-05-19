# M-B1 Test Report

## Build

- `npm run build -w frontend` — PASS
- `npm run build` — PASS

## Backend Regression

- `npm test -w backend` — PASS, 43/43 tests

## M-B1 Targeted E2E

- `npm test -w e2e -- tests/v3-mb1-foundations --config=playwright.live.config.ts --workers=1` — PASS, 4/4 tests

Covered:
- Static `100vh` / media-query audit
- `viewport-fit=cover`
- `__meetDebug.isMobile()`, `isIOS()`, `isAndroid()`
- Mobile 390x844 touch-target audit
- Desktop 1920x1080 non-leak regression

Note: default local Playwright webserver run was blocked by existing port `4720` usage from the live stack, so targeted and regression browser gates were run against `playwright.live.config.ts`.

## Run 1 Desktop Regression Gate

- `npm test -w e2e -- tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1` — PASS, 40/40 tests

## Deploy

- `pm2 restart meet-poc-fe` — PASS after build
