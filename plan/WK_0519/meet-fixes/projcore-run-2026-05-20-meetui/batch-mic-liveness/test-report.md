# Batch MIC-LIVENESS Test Report

Commands:
- `npm run build` — PASS.
- `MEET_DB_PATH=/tmp/meet-poc-mic-liveness.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-mic-liveness-recordings npm run seed` — PASS.
- `MEET_DB_PATH=/tmp/meet-poc-mic-liveness.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-mic-liveness-recordings E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_BASE_URL=http://localhost:4810 npm test -w e2e -- e2e/tests/v3-mic-liveness/mic-liveness.spec.ts` — PASS, 1/1.
- `pm2 restart meet-poc-be meet-poc-fe --update-env` — PASS.
- `pm2 env 40 | rg "MEET_DB_PATH|MEET_RECORDINGS_DIR|PORT|NODE_ENV|name"` — PASS, no test DB/recordings env present.
- `pm2 env 41 | rg "MEET_DB_PATH|MEET_RECORDINGS_DIR|PORT|NODE_ENV|name"` — PASS, no test DB/recordings env present.

Evidence:
- Screenshot: `screenshots/mic-liveness-diagnostics.png`.
- pm2 status after restart: `meet-poc-be` and `meet-poc-fe` online.
