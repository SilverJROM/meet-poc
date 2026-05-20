# DR-30/DR-32 Test Report

## Build

- `npm run build` — PASS

## Browser

All browser runs used `/tmp` DBs and isolated `49xx` ports. No hardcoded live URL was added.

- `MEET_DB_PATH=/tmp/meet-poc-tilefix.sqlite ... E2E_BASE_URL=http://localhost:4910 npm test -w e2e -- tests/v3-tilefix/tilefix.spec.ts` — PASS, 2/2
- Combined targeted gate:
  - `MEET_DB_PATH=/tmp/meet-poc-tilefix-gate.sqlite ... E2E_BASE_URL=http://localhost:4910 E2E_WS_ORIGIN=ws://localhost:4910 npm test -w e2e -- tests/v3-tilefix tests/v3-diagg-orientation-speaker tests/v3-fixc3-share-reflow tests/v3-mui-meet-ui tests/v3-reconcile --workers=1`
  - PASS, 12/12

## Screenshots

- `screenshots/camera-mirrored.png`
- `screenshots/screenshare-not-mirrored.png`
- `screenshots/stable-order-active-speaker.png`

## Backend

- Backend code was not changed in this batch.
- `npm run build` includes the backend TypeScript build and passed.

## Env Hygiene

- Playwright used isolated `/tmp` SQLite DBs and `/tmp` recordings directories.
- `env -u MEET_DB_PATH -u MEET_RECORDINGS_DIR -u E2E_BASE_URL -u E2E_BACKEND_PORT -u E2E_FRONTEND_PORT -u E2E_PROXY_PORT -u E2E_WS_ORIGIN pm2 restart meet-poc-be meet-poc-fe --update-env` — PASS
- pm2 env verification — PASS: `meet-poc-be` and `meet-poc-fe` are online with empty `MEET_DB_PATH`, `MEET_RECORDINGS_DIR`, `E2E_BASE_URL`, `E2E_BACKEND_PORT`, `E2E_FRONTEND_PORT`, `E2E_PROXY_PORT`, and `E2E_WS_ORIGIN`.
- Isolated test ports `4910`, `4911`, and `4920` had no listeners after Playwright shutdown.
