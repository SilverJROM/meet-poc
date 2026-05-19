# Batch FIXC2 Test Report

## Commands

| Check | Result |
|---|---|
| `npm run build -w backend` | PASS |
| `npm run build -w frontend` | PASS |
| `npm test -w backend` | PASS, 59/59 |
| `npm test -w e2e -- tests/v3-fixc2-device-modal --config=playwright.live.config.ts --workers=1` | PASS, 4/4 |
| Run 1 regression: `npm test -w e2e -- tests/v3-fixc1-camera-light tests/v3-fixb4-transcripts tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1` | PASS, 49/49 |
| `pm2 restart meet-poc-fe` | PASS |
| `pm2 status meet-poc-fe` | PASS, online |
| `curl -I http://localhost:4700` | PASS, HTTP 200 |
| `curl -i http://localhost:4700/api/me` | PASS, HTTP 200 |
| `E2E_BASE_URL=https://voice.silverjrom.app npm test -w e2e -- tests/v3-fixc2-device-modal --config=playwright.live.config.ts --workers=1` | PASS, 4/4 |

## Screenshots
- `screenshots/lobby-modal.png`
- `screenshots/in-call-dialog.png`

## Notes
- Frontend build still prints the existing Stencil empty-glob warning from Ionic internals; the build completed successfully.
- Public smoke used the same FIXC2 browser assertions against `https://voice.silverjrom.app/`.
