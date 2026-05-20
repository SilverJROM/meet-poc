# DIAGE1 Test Report

## Commands
- `npm run build -w backend`
- `npm run build -w frontend`
- `npm test -w backend -- rooms.test.ts signaling-auto-admit.test.ts`
- `MEET_DB_PATH=/tmp/meet-diage1.sqlite E2E_BACKEND_PORT=4724 E2E_FRONTEND_PORT=4715 E2E_PROXY_PORT=4714 E2E_BASE_URL=http://localhost:4714 E2E_WS_ORIGIN=ws://localhost:4714 npm test -w e2e -- tests/v3-diage1-rooms-slugs --config=playwright.config.ts --workers=1`
- `npm test -w backend`
- `MEET_DB_PATH=/tmp/meet-diage1-full.sqlite E2E_BACKEND_PORT=4724 E2E_FRONTEND_PORT=4715 E2E_PROXY_PORT=4714 E2E_BASE_URL=http://localhost:4714 E2E_WS_ORIGIN=ws://localhost:4714 npm test -w e2e -- tests/v3-diage1-rooms-slugs tests/v3-diagd-join-audio-invariant tests/v3-diagc-weak-connection tests/v3-diagb2-conn tests/v3-diagb1-lobby tests/v3-diag1-conn tests/v3-fixc8-transcriber-config tests/v3-fixc7-question-library tests/v3-fixc4-transcript-tools tests/v3-fixc3-share-reflow tests/v3-fixc2-device-modal tests/v3-fixc1-camera-light tests/v3-fixb4-transcripts tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.config.ts --workers=1`
- `npx tsx --eval "<runMigrations live DB verification>"`

## Results
- Backend build: PASS
- Frontend build: PASS
- Targeted backend slug/signaling tests: PASS, 13/13
- Backend tests: PASS, 106 passed / 1 skipped
- DIAGE1 focused E2E: PASS, 4 passed
- Clean-db Run-1 + diag sweep: PASS, 87 passed
- Live DB migration: PASS; `TEST_ROOM01` remains present and slugged.

## Evidence
- `screenshots/rooms-clickable.png`
- `screenshots/room-url-slug.png`

## Notes
- E2E used isolated SQLite DBs under `/tmp`.
- DIAGE1-created rooms are removed by `DIAGE1` title prefix cleanup.
