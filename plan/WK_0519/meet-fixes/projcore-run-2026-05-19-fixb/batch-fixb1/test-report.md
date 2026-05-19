# FIX-B1 Test Report

## Targeted FIX-B1 E2E

- `npm test -w e2e -- tests/v3-fixb1-race/race-and-controls.spec.ts --config=playwright.live.config.ts --workers=1` — PASS, 4/4

Covered:
- Buffered signaling race drains and peers connect.
- Remote audio/video tracks cross peers.
- Recording mix graph includes local plus remote sources and uploads an audio recording.
- Controls contrast is measurable in light theme.
- Background pause requires mobile viewport plus mobile UA.

## Backend

- `npm test -w backend` — PASS, 47/47

## Run 1 Desktop Regression Gate

- `npm test -w e2e -- tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1` — PASS, 40/40

## Build

- `npm run build -w frontend` — PASS
- `npm run build` — PASS

## Deploy/Live Smoke

- `pm2 restart meet-poc-fe` — PASS
- `curl -s https://voice.silverjrom.app/` — PASS, served refreshed `main-BTE6YXWW.js`
- `curl -s https://voice.silverjrom.app/room/3f324d8be763` — PASS, Angular app root served

## Evidence

- `batch-fixb1/screenshots/controls-light.png` — 1280x773 PNG screenshot of in-call light-theme controls.

## Notes

Run 1 regression screenshot churn was restored before commit.
