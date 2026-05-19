# M-B5 Test Report

## Targeted Backend

- `npm test -w backend -- recording.test.ts` — PASS, 9/9

## Targeted M-B5 E2E

- `npm test -w e2e -- tests/v3-mb5-ios --config=playwright.live.config.ts --workers=1` — PASS, 3/3

Covered:
- MediaRecorder capability fallback to `audio/mp4`.
- Upload filename extension follows selected codec.
- iOS branch starts MediaRecorder without a timeslice.
- Mobile landscape lobby and call controls fit 844x390.

## M-B4 Regression

- `npm test -w e2e -- tests/v3-mb4-lobby --config=playwright.live.config.ts --workers=1` — PASS, 4/4

## Backend

- `npm test -w backend` — PASS, 46/46

## Build

- `npm run build -w backend && npm run build -w frontend` — PASS
- `npm run build -w frontend` — PASS after landscape CSS adjustment
- `npm run build` — PASS

## Deploy

- `pm2 restart meet-poc-be meet-poc-fe` — PASS after backend/frontend build.
- `pm2 restart meet-poc-fe` — PASS after final frontend-only landscape adjustment.
- `pm2 restart meet-poc-be meet-poc-fe` — PASS after root build refresh.

## Run 1 Desktop Regression Gate

- `npm test -w e2e -- tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1` — PASS, 40/40

## Notes

Regression screenshot churn from v2 and M-B4 was restored before committing. M-B5 screenshots are limited to the new landscape evidence.
