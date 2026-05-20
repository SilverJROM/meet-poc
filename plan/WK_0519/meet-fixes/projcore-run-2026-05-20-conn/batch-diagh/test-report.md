# Batch DIAGH Test Report

## Targeted
- `npm test -w backend -- rooms.test.ts`: PASS, 13/13
- `MEET_DB_PATH=/tmp/meet-diagh-target.sqlite E2E_BACKEND_PORT=4850 E2E_FRONTEND_PORT=4841 E2E_PROXY_PORT=4840 E2E_BASE_URL=http://localhost:4840 E2E_WS_ORIGIN=ws://localhost:4840 npm test -w e2e -- tests/v3-diagh-rooms-search --config=playwright.config.ts --workers=1`: PASS, 1/1

## Build And Backend
- `npm run build`: PASS
- `npm test -w backend`: PASS, 114 passed / 1 skipped

## Clean Run-1 + Diag Gate
The gate used `/tmp/meet-diagh-gate.sqlite`, inserted legacy `TEST_ROOM01` before Playwright started, and kept `MEET_DB_PATH` inline. `MEET_RECORDINGS_DIR` was not overridden because legacy recording specs assert the default recordings path.

```bash
MEET_DB_PATH=/tmp/meet-diagh-gate.sqlite E2E_BACKEND_PORT=4860 E2E_FRONTEND_PORT=4851 E2E_PROXY_PORT=4850 E2E_BASE_URL=http://localhost:4850 E2E_WS_ORIGIN=ws://localhost:4850 npm test -w e2e -- tests/v3-diagh-rooms-search tests/v3-diagg-orientation-speaker tests/v3-diage2-waiting-room tests/v3-diagf-conn-resilience tests/v3-diage1-rooms-slugs tests/v3-diagd-join-audio-invariant tests/v3-diagc-weak-connection tests/v3-diagb2-conn tests/v3-diagb1-lobby tests/v3-diag1-conn tests/v3-fixc8-transcriber-config tests/v3-fixc7-question-library tests/v3-fixc4-transcript-tools tests/v3-fixc3-share-reflow tests/v3-fixc2-device-modal tests/v3-fixc1-camera-light tests/v3-fixb4-transcripts tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.config.ts --workers=1
```

Result: PASS, 94/94.

## pm2 Hygiene
- Restarted with `pm2 delete meet-poc-be meet-poc-fe` followed by `pm2 start ecosystem.config.js`.
- `pm2 env 22` showed `NODE_ENV=development`, `PORT=4720`, and no `MEET_DB_PATH` / `MEET_RECORDINGS_DIR`.
- `pm2 env 23` showed `NODE_ENV=production`, `PORT=4700`, `BACKEND_ORIGIN=http://localhost:4720`, and no `MEET_DB_PATH` / `MEET_RECORDINGS_DIR`.
- `curl -fsS http://localhost:4700/login` returned the Angular shell.
