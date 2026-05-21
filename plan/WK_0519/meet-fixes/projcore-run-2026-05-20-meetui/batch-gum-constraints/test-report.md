# Batch GUM Constraints Test Report

## Build
- PASS: npm run build -w frontend
- PASS: npm run build -w frontend before pm2 restart
- Note: Angular build emitted the existing Stencil empty-glob warning.

## Targeted E2E
- PASS: MEET_DB_PATH=/tmp/meet-poc-gum-constraints.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-gum-constraints-recordings E2E_BASE_URL=http://localhost:4810 E2E_PROXY_PORT=4810 E2E_FRONTEND_PORT=4811 E2E_BACKEND_PORT=4820 npm test -w e2e -- tests/v3-extdev/extdev.spec.ts
- Covered lobby selected mic acquisition, in-call mic switch, exact-device fallback to default, reconnect sanity, audio sender diagnostics, and /app/diagnostics rendering of EC/NS/AGC applied settings.

## Deploy Verification
- PASS: pm2 restart meet-poc-be meet-poc-fe
- PASS: curl -fsS http://localhost:4700/app/diagnostics returned 200
- PASS: pm2 env check emitted no MEET_DB_PATH, MEET_RECORDINGS_DIR, /tmp/meet-poc-gum, or 48xx E2E variable leak.
