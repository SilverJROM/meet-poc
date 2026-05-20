# DIAGB2 Test Report

## Targeted
- PASS: `npm run build -w backend`
- PASS: `npm run build -w frontend`
- PASS: `npm test -w backend -- signaling-reconnect.test.ts signaling-wire-format.test.ts signaling-knock-admit.test.ts`
- PASS: `E2E_BACKEND_PORT=4722 E2E_FRONTEND_PORT=4713 E2E_PROXY_PORT=4712 E2E_BASE_URL=http://localhost:4712 E2E_WS_ORIGIN=ws://localhost:4712 npm test -w e2e -- tests/v3-diagb2-conn --config=playwright.config.ts --workers=1`

## Screenshots
- `screenshots/screen-share-helper.png`
- `screenshots/diagnostics-panel.png`

## Full Gate
- PASS: `npm test -w backend` -> 103 passed / 1 skipped.
- PASS: `npm run build` -> backend + frontend build passed.
- PASS: `E2E_BACKEND_PORT=4722 E2E_FRONTEND_PORT=4713 E2E_PROXY_PORT=4712 E2E_BASE_URL=http://localhost:4712 E2E_WS_ORIGIN=ws://localhost:4712 npm test -w e2e -- tests/v3-diagb2-conn tests/v3-diagb1-lobby tests/v3-diag1-conn tests/v3-fixc8-transcriber-config tests/v3-fixc7-question-library tests/v3-fixc4-transcript-tools tests/v3-fixc3-share-reflow tests/v3-fixc2-device-modal tests/v3-fixc1-camera-light tests/v3-fixb4-transcripts tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.config.ts --workers=1` -> 77 passed.
- PASS: `pm2 restart meet-poc-fe meet-poc-be`
- PASS: `npm test -w e2e -- tests/v3-diagb2-conn --config=playwright.live.config.ts --workers=1` -> 3 passed live smoke.
