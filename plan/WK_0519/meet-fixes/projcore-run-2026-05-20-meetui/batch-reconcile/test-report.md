# DR-31 Test Report

## Build

- `npm run build` — PASS

## Backend

- `npm test -w backend -- --run` — PASS, 121 passed, 1 skipped
- New/updated coverage includes:
  - guest token resume after old socket closes
  - guest token resume before old socket close handler runs
  - owner resume after drop
  - owner resume before old socket close handler runs
  - stolen-token rejection
  - owner/guest participantId wire contracts
  - mobile/global cap tests using distinct participant identities

## Browser

All browser runs used `/tmp` DBs and isolated ports, with no live pm2 restart or deploy.

- `MEET_DB_PATH=/tmp/meet-poc-reconcile.sqlite ... E2E_BASE_URL=http://localhost:4810 npm test -w e2e -- tests/v3-reconcile/reconcile.spec.ts` — PASS, 2/2
- `MEET_DB_PATH=/tmp/meet-poc-diagf-reconcile.sqlite ... E2E_BASE_URL=http://localhost:4810 npm test -w e2e -- tests/v3-diagf-conn-resilience/diagf-conn-resilience.spec.ts` — PASS, 2/2
- Combined recent-batch gate:
  - `MEET_DB_PATH=/tmp/meet-poc-reconcile-gate.sqlite ... E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- tests/v3-reconcile tests/v3-diagf-conn-resilience tests/v3-mui-meet-ui tests/v3-chat tests/v3-diaglog --workers=1`
  - PASS, 10/10

## Screenshots

- `screenshots/guest-reconnecting-same-tile.png`
- `screenshots/guest-resumed-no-ghost.png`
- `screenshots/owner-reconnecting-same-tile.png`
- `screenshots/owner-resumed-no-ghost.png`

## Env Hygiene

- No pm2 restart or deploy was performed.
- Live pm2 env check: `meet-poc-be` and `meet-poc-fe` are online with empty `MEET_DB_PATH`, `E2E_BASE_URL`, `E2E_BACKEND_PORT`, and `E2E_PROXY_PORT`.
- Isolated test ports `4810`, `4811`, and `4820` had no listeners after Playwright shutdown.
