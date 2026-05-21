# Batch share-camera-cut Test Report

## PASS
- `npm run build -w frontend`
- `MEET_DB_PATH=/tmp/meet-share-camera-cut.sqlite MEET_RECORDINGS_DIR=/tmp/meet-share-camera-cut-recordings E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 npm test -w e2e -- tests/v3-share-camera-cut --config=playwright.config.ts --workers=1`
  - 1/1 PASS.
  - Screenshot: `screenshots/share-cameras-suppressed.png`.

## Regression checks
- Same isolated `/tmp` DB and 48xx ports:
  - PASS: `tests/v3-audiofix` (DR-34 remote audio sink with camera off).
  - PASS: `tests/v3-diagc-weak-connection` (DR-42 degrade/audio-only policy).
  - PASS: `tests/v3-fixc3-share-reflow` first scenario (share layout/function, active speaker strip, collapse, return to grid).
  - PASS: `tests/v3-mobile-rx-video` (DR-51/DR-52 mobile degrade/cull).
  - FAIL: `tests/v3-fixc3-share-reflow` second scenario still attempts 8 admitted participants. That expectation conflicts with accepted cap5 behavior and failed while waiting for `socket-5` admission, not because of DR-53 screen-share suppression.

## Env hygiene
- E2E used inline env only with `/tmp` DBs and isolated ports `4810/4811/4820`.
- No live `MEET_DB_PATH` or `MEET_RECORDINGS_DIR` export was used.
- Deploy rebuild used `env -u MEET_DB_PATH -u MEET_RECORDINGS_DIR npm run build -w frontend`.
- PM2 restart used `env -u MEET_DB_PATH -u MEET_RECORDINGS_DIR pm2 restart ecosystem.config.js`.
- Served app verified: `curl -I http://localhost:4700/login` returned `HTTP/1.1 200 OK`.
- PM2 env verified for `meet-poc-be` and `meet-poc-fe`: no `MEET_DB_PATH` or `MEET_RECORDINGS_DIR`; only app env from `ecosystem.config.js`.
- Live DB check confirmed `TEST_ROOM01` row remains present.
