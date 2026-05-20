# DIAGE2 Test Report

## Build

```bash
npm run build -w backend
npm run build -w frontend
```

Result: PASS. Frontend emitted the existing Stencil empty-glob warning.

## Backend

```bash
npm test -w backend -- rooms.test.ts signaling-waiting-room.test.ts
```

Result: PASS, 16 tests.

```bash
npm test -w backend
```

Result: PASS, 113 passed / 1 skipped.

## DIAGE2 E2E

```bash
MEET_DB_PATH=/tmp/meet-diage2-target.sqlite MEET_RECORDINGS_DIR=/tmp/meet-diage2-recordings E2E_BACKEND_PORT=4830 E2E_FRONTEND_PORT=4821 E2E_PROXY_PORT=4820 E2E_BASE_URL=http://localhost:4820 E2E_WS_ORIGIN=ws://localhost:4820 npm test -w e2e -- tests/v3-diage2-waiting-room/diage2-waiting-room.spec.ts --config=playwright.config.ts --workers=1
```

Result: PASS, 2 tests.

## Clean Run-1 + Diag Gate

The clean isolated DB was seeded, `TEST_ROOM01` was inserted for legacy lobby specs, and the gate was run with inline `MEET_DB_PATH` only. `MEET_RECORDINGS_DIR` was intentionally not overridden because legacy Run-1 recording tests assert the default `recordings/` path.

```bash
MEET_DB_PATH=/tmp/meet-diage2-full.sqlite E2E_BACKEND_PORT=4830 E2E_FRONTEND_PORT=4821 E2E_PROXY_PORT=4820 E2E_BASE_URL=http://localhost:4820 E2E_WS_ORIGIN=ws://localhost:4820 npm test -w e2e -- tests/v3-diage2-waiting-room tests/v3-diagf-conn-resilience tests/v3-diage1-rooms-slugs tests/v3-diagd-join-audio-invariant tests/v3-diagc-weak-connection tests/v3-diagb2-conn tests/v3-diagb1-lobby tests/v3-diag1-conn tests/v3-fixc8-transcriber-config tests/v3-fixc7-question-library tests/v3-fixc4-transcript-tools tests/v3-fixc3-share-reflow tests/v3-fixc2-device-modal tests/v3-fixc1-camera-light tests/v3-fixb4-transcripts tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.config.ts --workers=1
```

Result: PASS, 91 passed.

## Screenshots

- `screenshots/room-closed-waiting.png`
- `screenshots/host-open-toggle.png`
- `screenshots/room-open-admit.png`

## Live Restart / Env Hygiene

```bash
pm2 delete meet-poc-be meet-poc-fe
env -u MEET_DB_PATH -u MEET_RECORDINGS_DIR pm2 start ecosystem.config.js
pm2 env 18
pm2 env 19
curl -fsS http://localhost:4720/health
```

Result: PASS. `meet-poc-be` and `meet-poc-fe` are online, backend health returned `{"ok":true}`, and pm2 env for the live services contains no `MEET_DB_PATH` or `MEET_RECORDINGS_DIR`.

Live DB migration check: `rooms` has `is_open` and `wait_timeout_minutes`; `TEST_ROOM01` exists with `is_open=0` and `wait_timeout_minutes=15`.
