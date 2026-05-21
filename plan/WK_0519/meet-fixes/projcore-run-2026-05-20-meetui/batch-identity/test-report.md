# DR-37 Test Report

## Commands
- `npm test -w backend -- tests/signaling-reconnect.test.ts`
- `npm run build`
- `MEET_DB_PATH=/tmp/meet-poc-identity.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-identity-recordings npm run seed`
- `MEET_DB_PATH=/tmp/meet-poc-identity.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-identity-recordings E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 E2E_PROXY_PORT=4810 E2E_FRONTEND_PORT=4811 E2E_BACKEND_PORT=4820 npm test -w e2e -- tests/v3-identity/identity.spec.ts`
- `npm test -w backend`
- `pm2 restart meet-poc-be meet-poc-fe`
- `curl -fsS http://localhost:4700/login`

## Results
- Targeted backend reconnect tests: PASS, 9/9.
- Build: PASS.
- DR-37 E2E reload/rejoin identity spec: PASS, 1/1.
- Full backend suite: PASS, 126 passed, 1 skipped.
- PM2 clean restart: PASS; `meet-poc-be` and `meet-poc-fe` online.
- Env leak check: PASS; `MEET_DB_PATH=<unset>` and `MEET_RECORDINGS_DIR=<unset>` for both meet-poc PM2 processes.
- Live login smoke check: PASS, `/login` returned 1590 bytes.

## Screenshot
- `screenshots/reload-rejoin-same-identity.png`
