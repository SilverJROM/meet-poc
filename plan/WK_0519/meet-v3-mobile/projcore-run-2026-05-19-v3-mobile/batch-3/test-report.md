# M-B3 Test Report

## Targeted M-B3 E2E

- `npm test -w e2e -- tests/v3-mb3-call-layout --config=playwright.live.config.ts --workers=1` — PASS, 9/9

Covered:
- Mobile 75dvh bottom-sheet with backdrop, handle, tap tabs, and swipe-down dismiss.
- Mobile docked controls with safe-area placement.
- Desktop controls unchanged.
- Mobile grid variants for 1, 2, and 3-4 peers.
- Mobile screen-share button `toHaveCount(0)`.
- Desktop screen-share button visible.
- Desktop sidebar remains non-mobile right-side panel.

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

Browser gates used `playwright.live.config.ts` against the live PM2 stack serving `voice.silverjrom.app`/port 4700. Old v2 regression screenshots were restored after the regression run so only M-B3 evidence remains in this batch.
