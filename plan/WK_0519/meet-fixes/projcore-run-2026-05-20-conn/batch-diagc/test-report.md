# Batch DIAGC Test Report

## Completed
- PASS: `npm run build -w frontend`
- PASS: `npm run build -w backend`
- PASS: `npm test -w backend` -> 103 passed / 1 skipped.
- PASS: `E2E_BACKEND_PORT=4722 E2E_FRONTEND_PORT=4713 E2E_PROXY_PORT=4712 E2E_BASE_URL=http://localhost:4712 E2E_WS_ORIGIN=ws://localhost:4712 npm test -w e2e -- tests/v3-diagc-weak-connection --config=playwright.config.ts --workers=1` -> 1 passed.
- PASS: `E2E_BACKEND_PORT=4722 E2E_FRONTEND_PORT=4713 E2E_PROXY_PORT=4712 E2E_BASE_URL=http://localhost:4712 E2E_WS_ORIGIN=ws://localhost:4712 npm test -w e2e -- tests/v3-diagc-weak-connection tests/v3-diagb2-conn tests/v3-diagb1-lobby tests/v3-diag1-conn tests/v3-fixc8-transcriber-config tests/v3-fixc7-question-library tests/v3-fixc4-transcript-tools tests/v3-fixc3-share-reflow tests/v3-fixc2-device-modal tests/v3-fixc1-camera-light tests/v3-fixb4-transcripts tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.config.ts --workers=1` -> 78 passed.
- PASS after final signal-payload guard: `MEET_DB_PATH=/tmp/meet-diagc.sqlite E2E_BACKEND_PORT=4722 E2E_FRONTEND_PORT=4713 E2E_PROXY_PORT=4712 E2E_BASE_URL=http://localhost:4712 E2E_WS_ORIGIN=ws://localhost:4712 npm test -w e2e -- tests/v3-diagc-weak-connection tests/v3-diagb2-conn tests/v3-diagb1-lobby tests/v3-diag1-conn tests/v3-fixc8-transcriber-config tests/v3-fixc7-question-library tests/v3-fixc4-transcript-tools tests/v3-fixc3-share-reflow tests/v3-fixc2-device-modal tests/v3-fixc1-camera-light tests/v3-fixb4-transcripts tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.config.ts --workers=1` -> 78 passed.

## Notes
- Shared local DB reruns can fail the legacy v2-b4/v2-b5 fixture assumptions when prior E2E runs leave active sessions or room-count residue. The final full gate used an isolated `MEET_DB_PATH=/tmp/meet-diagc.sqlite` DB with the required `TEST_ROOM01` baseline and passed 78/78.
- pm2 restart completed for `meet-poc-fe` and `meet-poc-be`.

## Evidence
- `screenshots/weak-connection-banner.png`
- `screenshots/audio-only-toggle.png`
- `screenshots/quality-pill.png`
