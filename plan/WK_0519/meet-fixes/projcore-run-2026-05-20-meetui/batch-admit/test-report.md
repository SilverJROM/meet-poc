# Batch Admit Test Report

## Backend
- `npm test -w backend -- signaling-reconnect.test.ts`
  - PASS: 11/11
  - Covers auto-admit after grace, explicit leave revoke, re-admit clears revoke, bare close code/reason as drop, unknown key still knocks, token/clientKey/owner reconnect regressions.
- `npm test -w backend -- signaling-auto-admit.test.ts signaling-knock-admit.test.ts signaling-peer-left.test.ts signaling-waiting-room.test.ts signaling-wire-format.test.ts`
  - PASS: 11/11
  - Covers owner auto-admit, waiting-room/knock/admit/reject, explicit peer-left, and wire-shape regressions.

## Build
- `npm run build`
  - PASS

## E2E
- Pre-seed:
  - `MEET_DB_PATH=/tmp/meet-poc-admit.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-admit-recordings npm run seed`
  - PASS
- DR-38/DR-39 target:
  - `MEET_DB_PATH=/tmp/meet-poc-admit.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-admit-recordings E2E_BACKEND_PORT=4830 E2E_FRONTEND_PORT=4821 E2E_PROXY_PORT=4820 E2E_BASE_URL=http://localhost:4820 E2E_WS_ORIGIN=ws://localhost:4820 npm test -w e2e -- tests/v3-admit/admit.spec.ts --config=playwright.config.ts --workers=1`
  - PASS: 2/2
- Regression:
  - `MEET_DB_PATH=/tmp/meet-poc-admit-regress.sqlite MEET_RECORDINGS_DIR=/tmp/meet-poc-admit-regress-recordings E2E_BACKEND_PORT=4830 E2E_FRONTEND_PORT=4821 E2E_PROXY_PORT=4820 E2E_BASE_URL=http://localhost:4820 E2E_WS_ORIGIN=ws://localhost:4820 npm test -w e2e -- tests/v3-reconcile/reconcile.spec.ts tests/v3-audiofix/audiofix.spec.ts --config=playwright.config.ts --workers=1`
  - PASS: 3/3

## Env Hygiene
- `env | rg '^(MEET_DB_PATH|MEET_RECORDINGS_DIR|E2E_|PORT)=' || true`: PASS, no output.
- `ss -ltnp | rg ':(4820|4821|4830)\b' || true`: PASS, no output.
- pm2 jlist check: `meet-poc-be` and `meet-poc-fe` online; no `MEET_DB_PATH`, `MEET_RECORDINGS_DIR`, or `E2E_PROXY_PORT`.
