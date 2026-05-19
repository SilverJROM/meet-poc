# M-B2 Test Report

## Targeted Backend

- `npm test -w backend -- signaling-mobile-cap.test.ts` — PASS, 2/2

## Targeted E2E

- `npm test -w e2e -- tests/v3-mb2-webrtc --config=playwright.live.config.ts --workers=1` — PASS, 5/5

Covered:
- Mobile 480p constraints
- Desktop video constraints unaffected
- Mobile cap rejection UI
- Mobile background-tab pause + peer media-state propagation
- Desktop background-tab unaffected

## Full Backend

- `npm test -w backend` — PASS, 45/45

## Build

- `npm run build -w backend` — PASS
- `npm run build -w frontend` — PASS
- `npm run build` — PASS

## Deploy

- `pm2 restart meet-poc-be meet-poc-fe` — PASS

## Run 1 Desktop Regression Gate

- `npm test -w e2e -- tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1` — PASS, 40/40

## Notes

The browser gates used `playwright.live.config.ts` against the live local PM2 stack on port 4700. This matches the M-B1 gate approach because the default e2e webserver port remains occupied by the active stack.
