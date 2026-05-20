# DR-29 Test Report

## Build

- `npm run build` — PASS

## Backend

- `npm test -w backend -- --run` — PASS, 121 passed, 1 skipped

## Browser

All browser runs used `/tmp` DBs and isolated `48xx` ports. No hardcoded live URL was added.

- `MEET_DB_PATH=/tmp/meet-poc-extdev.sqlite ... E2E_BASE_URL=http://localhost:4810 npm test -w e2e -- tests/v3-extdev/extdev.spec.ts` — PASS, 1/1
- Combined targeted gate:
  - `MEET_DB_PATH=/tmp/meet-poc-extdev-gate.sqlite ... E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- tests/v3-extdev tests/v3-diagi-device-switch tests/v3-reconcile tests/v3-diaglog --workers=1`
  - PASS, 6/6

## Screenshots

- `screenshots/external-mic-diagnostics.png`

## Env Hygiene

- Playwright used isolated `/tmp` SQLite DBs and `/tmp` recordings directories.
- `env -u MEET_DB_PATH -u MEET_RECORDINGS_DIR -u E2E_BASE_URL -u E2E_BACKEND_PORT -u E2E_FRONTEND_PORT -u E2E_PROXY_PORT -u E2E_WS_ORIGIN pm2 restart meet-poc-be meet-poc-fe --update-env` — PASS
- pm2 env verification — PASS: `meet-poc-be` and `meet-poc-fe` are online with empty `MEET_DB_PATH`, `MEET_RECORDINGS_DIR`, `E2E_BASE_URL`, `E2E_BACKEND_PORT`, `E2E_FRONTEND_PORT`, `E2E_PROXY_PORT`, and `E2E_WS_ORIGIN`.
- Isolated test ports `4810`, `4811`, and `4820` had no listeners after Playwright shutdown.
