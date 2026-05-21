# DR-43 Test Report

## Backend

- `npm test -w backend -- --runInBand`
  - FAIL: Vitest does not support the Jest-only `--runInBand` option. No tests ran.
- `npm test -w backend`
  - PASS: 129 tests, 1 skipped.

## Build

- `npm run build -w frontend`
  - PASS: Angular production build.

## E2E

- Isolated `/tmp` DB and recordings, ports 4810/4820/4811:
  - `MEET_DB_PATH=/tmp/meet-poc-dr43.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-dr43-recordings E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- tests/v3-dr41-diagnostics/dr41-diagnostics.spec.ts`
  - PASS: 1 test.

## Screenshots

- `screenshots/diagnostics-forensics.png`
- `screenshots/diagnostics-logging-toggle.png`

## Deploy Verification

- `pm2 restart meet-poc-be meet-poc-fe --update-env`
  - PASS: both processes online.
- `pm2 env 42` / `pm2 env 43`
  - PASS: no `MEET_DB_PATH`, `MEET_RECORDINGS_DIR`, or `E2E_*` leak in meet processes.
- `curl http://localhost:4700/`
  - PASS: served rebuilt frontend index references `main-WB5SAGGA.js`.
- `curl http://localhost:4700/chunk-PB4ACUXS.js`
  - PASS: served diagnostics chunk contains `WS health`, `pair count`, `restart audit`, and `Timeline`.
- `curl http://localhost:4700/chunk-TAW565IG.js`
  - PASS: served room chunk contains `candidatePairCount`, `transitionTimeline`, and `autoRecoveryOutcome`.
