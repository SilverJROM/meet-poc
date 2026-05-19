# M-B4 Test Report

## Targeted M-B4 E2E

- `npm test -w e2e -- tests/v3-mb4-lobby --config=playwright.live.config.ts --workers=1` — PASS, 4/4

Covered:
- Mobile camera switch visible and asserts `facingMode` constraint directly.
- Desktop camera switch absent.
- Mobile selectors stack vertically.
- Mobile AudioContext activation is gesture-gated and starts meter activity after tap.

## M-B3 Regression

- `npm test -w e2e -- tests/v3-mb3-call-layout --config=playwright.live.config.ts --workers=1` — PASS, 9/9

## Backend

- `npm test -w backend` — PASS, 45/45

## Build

- `npm run build -w frontend` — PASS
- `npm run build` — PASS

## Deploy

- `pm2 restart meet-poc-fe` — PASS after frontend build.
- `pm2 restart meet-poc-fe` — PASS after root build refresh.

## Run 1 Desktop Regression Gate

- `npm test -w e2e -- tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1` — PASS, 40/40

## Notes

The browser gates used `playwright.live.config.ts` against the live PM2 stack. Regression screenshot churn from prior batches was restored before committing.
