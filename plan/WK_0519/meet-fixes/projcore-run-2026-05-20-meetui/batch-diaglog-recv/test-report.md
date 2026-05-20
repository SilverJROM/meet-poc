# DR-33 Test Report

## Build

- `npm run build` — PASS

## Backend

- `npm test -w backend -- session-diagnostics` — PASS, 2/2

## Browser

Used command-scoped `/tmp` DB and recordings paths plus isolated 48xx ports.

- Pre-seed: `MEET_DB_PATH=/tmp/meet-poc-recv.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-recv-recordings npm run seed -w backend` — PASS
- `MEET_DB_PATH=/tmp/meet-poc-recv.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-recv-recordings E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- e2e/tests/v3-diaglog-recv/diaglog-recv.spec.ts` — PASS, 1/1

## Screenshots

- `screenshots/diagnostics-inbound-audio.png`

## Env Hygiene

- Live pm2 restart used `env -u MEET_DB_PATH -u MEET_RECORDINGS_DIR pm2 delete meet-poc-be meet-poc-fe` followed by `env -u MEET_DB_PATH -u MEET_RECORDINGS_DIR pm2 start ecosystem.config.js`.
- `meet-poc-be` and `meet-poc-fe` are online.
- `pm2 env` verification: no `MEET_DB_PATH` or `MEET_RECORDINGS_DIR` present on either live service.
- `/login` responds on `http://localhost:4700`.
- `TEST_ROOM01` was not touched.
