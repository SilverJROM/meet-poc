# DIAGD Test Report

## Commands
- `npm run build -w frontend`
- `npm run build -w backend`
- `npm test -w backend`
- `MEET_DB_PATH=/tmp/meet-diagd.sqlite E2E_BACKEND_PORT=4724 E2E_FRONTEND_PORT=4715 E2E_PROXY_PORT=4714 E2E_BASE_URL=http://localhost:4714 E2E_WS_ORIGIN=ws://localhost:4714 npm test -w e2e -- tests/v3-diagd-join-audio-invariant --config=playwright.config.ts --workers=1`
- `MEET_DB_PATH=/tmp/meet-diagd-full.sqlite E2E_BACKEND_PORT=4724 E2E_FRONTEND_PORT=4715 E2E_PROXY_PORT=4714 E2E_BASE_URL=http://localhost:4714 E2E_WS_ORIGIN=ws://localhost:4714 npm test -w e2e -- tests/v3-diagd-join-audio-invariant tests/v3-diagc-weak-connection tests/v3-diagb2-conn tests/v3-diagb1-lobby tests/v3-diag1-conn tests/v3-fixc8-transcriber-config tests/v3-fixc7-question-library tests/v3-fixc4-transcript-tools tests/v3-fixc3-share-reflow tests/v3-fixc2-device-modal tests/v3-fixc1-camera-light tests/v3-fixb4-transcripts tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.config.ts --workers=1`

## Results
- Frontend build: PASS
- Backend build: PASS
- Backend tests: PASS, 103 passed / 1 skipped
- DIAGD focused E2E: PASS, 5 passed
- Clean-db Run-1 + diag sweep: PASS, 83 passed

## Evidence
- `screenshots/join-popout-name.png`
- `screenshots/join-popout-mic.png`
- `screenshots/join-popout-both.png`

## Notes
- Test databases were isolated under `/tmp`; the DIAGD specs also clean rooms by `DIAGD` prefix in setup and teardown.
