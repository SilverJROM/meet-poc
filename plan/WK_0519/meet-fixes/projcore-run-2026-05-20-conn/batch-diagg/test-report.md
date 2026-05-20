# Batch DIAGG Test Report

## Commands
- `npm run build`
- `npm test -w backend`
- `MEET_DB_PATH=/tmp/meet-diagg-target.sqlite MEET_RECORDINGS_DIR=/tmp/meet-diagg-recordings E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- e2e/tests/v3-diagg-orientation-speaker --workers=1`
- `MEET_DB_PATH=/tmp/meet-diagg-fixc3.sqlite E2E_BACKEND_PORT=4840 E2E_FRONTEND_PORT=4831 E2E_PROXY_PORT=4830 E2E_BASE_URL=http://localhost:4830 E2E_WS_ORIGIN=ws://localhost:4830 npm test -w e2e -- tests/v3-fixc3-share-reflow tests/v3-diagg-orientation-speaker --config=playwright.config.ts --workers=1`

## Clean Run-1 + Diag Gate
The clean gate used `/tmp/meet-diagg-gate.sqlite`, inserted the legacy `TEST_ROOM01` fixture before Playwright started, and kept `MEET_DB_PATH` inline only. `MEET_RECORDINGS_DIR` was not overridden because legacy recording specs assert the default recordings path.

```bash
MEET_DB_PATH=/tmp/meet-diagg-gate.sqlite E2E_BACKEND_PORT=4830 E2E_FRONTEND_PORT=4821 E2E_PROXY_PORT=4820 E2E_BASE_URL=http://localhost:4820 E2E_WS_ORIGIN=ws://localhost:4820 npm test -w e2e -- tests/v3-diagg-orientation-speaker tests/v3-diage2-waiting-room tests/v3-diagf-conn-resilience tests/v3-diage1-rooms-slugs tests/v3-diagd-join-audio-invariant tests/v3-diagc-weak-connection tests/v3-diagb2-conn tests/v3-diagb1-lobby tests/v3-diag1-conn tests/v3-fixc8-transcriber-config tests/v3-fixc7-question-library tests/v3-fixc4-transcript-tools tests/v3-fixc3-share-reflow tests/v3-fixc2-device-modal tests/v3-fixc1-camera-light tests/v3-fixb4-transcripts tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.config.ts --workers=1
```

Result: PASS, 93/93.

## pm2 Hygiene
- Restarted with `pm2 delete meet-poc-be meet-poc-fe` followed by `pm2 start ecosystem.config.js`.
- `pm2 env 20` showed `NODE_ENV=development`, `PORT=4720`, and no `MEET_DB_PATH` / `MEET_RECORDINGS_DIR`.
- `pm2 env 21` showed `NODE_ENV=production`, `PORT=4700`, `BACKEND_ORIGIN=http://localhost:4720`, and no `MEET_DB_PATH` / `MEET_RECORDINGS_DIR`.
- `curl -fsS http://localhost:4700/login` returned the Angular shell.
