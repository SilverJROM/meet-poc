# Batch STABILITY Test Report

## PASS

- `npm run build -w frontend`: PASS
- `npm run build`: PASS
- Isolated targeted DR-40 spec on `/tmp` DB and 48xx ports:
  - `MEET_DB_PATH=/tmp/meet-poc-stability.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-stability-recordings E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_BASE_URL=http://localhost:4810 npm test -w e2e -- tests/v3-stability/stability.spec.ts`
  - Result: 3 passed.
- Isolated DR-40 adjacent gate on `/tmp` DB and 48xx ports:
  - `MEET_DB_PATH=/tmp/meet-poc-dr40-gate.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-dr40-gate-recordings E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_BASE_URL=http://localhost:4810 npm test -w e2e -- tests/v3-stability/stability.spec.ts tests/v3-admit/admit.spec.ts tests/v3-reconcile/reconcile.spec.ts tests/v3-identity/identity.spec.ts tests/v3-diagf-conn-resilience/diagf-conn-resilience.spec.ts tests/v3-audiofix/audiofix.spec.ts tests/v3-diagc-weak-connection/diagc-weak-connection.spec.ts`
  - Result: 12 passed.

## FULL E2E

- Command:
  - `MEET_DB_PATH=/tmp/meet-poc-full-e2e.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-full-e2e-recordings E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_BASE_URL=http://localhost:4810 npm test -w e2e`
- Result: FAIL, 130 passed / 33 failed / 15 did not run.
- Notes:
  - The new DR-40 stability specs passed inside the full run.
  - Failures were broad pre-existing/stale full-suite issues: old slug-vs-id route assertions, tests hardcoding `127.0.0.1:4710` during a 48xx isolated run, recording/transcription side effects, and unrelated mobile/layout expectations.
  - The DR-40 adjacent gate was rerun separately and passed 12/12.

## Evidence

- Screenshot: `screenshots/terminal-pc-recreated.png`

## Deploy Verification

- `env -u MEET_DB_PATH -u MEET_RECORDINGS_DIR pm2 delete meet-poc-be meet-poc-fe && env -u MEET_DB_PATH -u MEET_RECORDINGS_DIR pm2 start ecosystem.config.js --only meet-poc-be,meet-poc-fe && pm2 save`: PASS.
- `curl -fsS http://localhost:4700/`: PASS, served built Angular app with `main-AVTMLHZN.js` and `<app-root>`.
- `curl -fsS http://localhost:4720/health`: PASS, `{"ok":true}`.
- `pm2 env` hygiene: PASS. `meet-poc-be` has only `NODE_ENV=development`, `PORT=4720`; `meet-poc-fe` has `NODE_ENV=production`, `PORT=4700`, `BACKEND_ORIGIN`, `FRONTEND_ORIGIN`. No `MEET_DB_PATH` or `MEET_RECORDINGS_DIR`.
