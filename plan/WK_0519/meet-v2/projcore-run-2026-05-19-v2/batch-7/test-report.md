# v2-B7 Test Report

## Commands

- `npm run build -w frontend`
  - PASS: Angular production build after B7 wiring.
- `npm test -w e2e -- tests/v2-b7-controls --config=playwright.live.config.ts --workers=1`
  - PASS: 6 tests, 7.9s.
- `npm test -w backend`
  - PASS: 17 files, 43 tests.
- `npm run build`
  - PASS: backend TypeScript build + Angular production build.
- `npm test -w e2e -- tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls --config=playwright.live.config.ts --workers=1`
  - PASS: 32 tests, 38.0s.
- `pm2 restart meet-poc-fe`
  - PASS: frontend/proxy process online.
- Public live smoke against `https://voice.silverjrom.app`
  - PASS: created temp room, joined as host, verified Record icon button visible, captured `screenshots/live-host-controls-record-visible.png`, deleted temp room.

## Worker Choice

The cross-batch Playwright sweep used `--workers=1` because prior B6 validation identified shared live-DB races when B4 ongoing-session tests run alongside room-creating call tests. This matches the B7 brief's parallel-test hygiene guidance.

## Screenshots

- `screenshots/host-controls-record-visible.png`
- `screenshots/non-host-controls-no-record.png`
- `screenshots/recording-banner-visible.png`
- `screenshots/permission-denied-polished.png`
- `screenshots/no-devices-polished.png`
- `screenshots/self-camera-off-avatar.png`
- `screenshots/live-host-controls-record-visible.png`

## Hygiene

- B7 local rooms with `B7CTRL%` prefix were removed after validation.
- The public `B7LIVE%` room was deleted through the API and DB cleanup found no leftovers.
- B7 test recordings with `B7CTRL` / `B7LIVE` naming were removed if present.
