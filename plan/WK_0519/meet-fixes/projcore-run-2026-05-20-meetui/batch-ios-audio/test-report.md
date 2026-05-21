# DR-45 Test Report

Environment:
- Targeted E2E used `/tmp/meet-poc-ios-audio.sqlite`
- Recordings used `/tmp/meet-poc-ios-audio-recordings`
- Ports were isolated in the 48xx range
- `TEST_ROOM01` was not touched

Results:
- PASS: `npm run build -w frontend`
- PASS: `npm run build`
- PASS: `MEET_DB_PATH=/tmp/meet-poc-ios-audio.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-ios-audio-recordings E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_BASE_URL=http://localhost:4810 npm test -w e2e -- e2e/tests/v3-ios-audio`
- PASS: `MEET_DB_PATH=/tmp/meet-poc-ios-audio.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-ios-audio-recordings E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4814 E2E_PROXY_PORT=4815 E2E_BASE_URL=http://localhost:4815 npm test -w e2e -- e2e/tests/v3-ios-audio`
- PASS: `MEET_DB_PATH=/tmp/meet-poc-ios-audio.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-ios-audio-recordings E2E_BACKEND_PORT=4821 E2E_FRONTEND_PORT=4812 E2E_PROXY_PORT=4813 E2E_BASE_URL=http://localhost:4813 npm test -w e2e -- e2e/tests/v3-audiofix`
- PASS: clean PM2 restart via `env -u MEET_DB_PATH -u MEET_RECORDINGS_DIR pm2 delete meet-poc-be meet-poc-fe` then `env -u MEET_DB_PATH -u MEET_RECORDINGS_DIR pm2 start ecosystem.config.js`
- PASS: PM2 env for `meet-poc-be` and `meet-poc-fe` contains no `MEET_DB_PATH` or `MEET_RECORDINGS_DIR`
- PASS: local backend health `http://127.0.0.1:4720/health` returned `{"ok":true}`
- PASS: local frontend served Angular app from `http://127.0.0.1:4700/`
- PASS: public `https://voice.silverjrom.app/` returned `<app-root></app-root>` and bundle `main-X4TX6XFO.js`

Coverage:
- New DR-45 test spoofs iOS, joins a remote peer, verifies no per-peer `audio[data-remote-audio]` elements are used, verifies one `audio[data-remote-audio-mixer]`, verifies the mixer output is playing, and verifies the mixer rewires to a replacement remote audio track.
- Existing DR-34 test verifies non-iOS still uses a live per-peer audio element and stays active when camera turns off/on.

Notes:
- `npx tsc -p e2e/tsconfig.json --noEmit` is not a usable gate in this repo today due existing unrelated e2e type errors across many older specs.
