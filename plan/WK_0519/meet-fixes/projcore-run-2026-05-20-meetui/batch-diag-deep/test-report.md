# DR-41 Test Report

## Backend

- `npm test -w backend -- session-diagnostics.test.ts`
  - PASS: 3 tests.
- `npm test -w backend`
  - PASS: 129 tests, 1 skipped.

## Build

- `npm run build`
  - PASS: backend TypeScript build and frontend Angular production build.

## E2E

- Isolated `/tmp` DB and recordings, ports 4810/4820/4811:
  - `npm test -w e2e -- v3-dr41-diagnostics`
  - PASS: 1 test.
- Fresh isolated `/tmp` DB and recordings, ports 4830/4840/4831:
  - `npm test -w e2e -- v3-dr41-diagnostics v3-diaglog v3-diaglog-recv`
  - PASS: 3 tests.

## Deploy Verification

- `pm2 restart meet-poc-be meet-poc-fe --update-env`
  - PASS: both processes online.
- `pm2 env 42` / `pm2 env 43`
  - PASS: no `MEET_DB_PATH`, `MEET_RECORDINGS_DIR`, or `E2E_*` leak in meet processes.
- `curl http://localhost:4700/`
  - PASS: served rebuilt frontend index references `main-AT6OQP6U.js`.
- `curl http://localhost:4700/chunk-LYNLNR3X.js`
  - PASS: served room chunk contains diagnostics logging toggle/storage code.
