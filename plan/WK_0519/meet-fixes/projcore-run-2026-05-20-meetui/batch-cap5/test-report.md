# Batch cap5 Test Report

## Targeted Backend

PASS: `/tmp` DBs via `backend/tests/helpers.ts`; helper deletes `MEET_DB_PATH` after each test.

Command:
```bash
npm test -w backend -- tests/signaling-room-full.test.ts tests/signaling-mobile-cap.test.ts
```

Result:
- 2 test files passed.
- 3 tests passed.

Coverage:
- Owner plus four guests admitted; sixth participant rejected with `room full (max 5)`.
- Four mobile participants admitted; fifth mobile rejected with `mobile room full (4 max)`.
- Owner plus four mobile guests reaches global five-participant cap; next desktop participant rejected with `room full (max 5)`.

## Build

PASS:
```bash
npm run build
```

Notes:
- Backend TypeScript build passed.
- Frontend Angular build passed.
- Angular emitted the existing Stencil empty-glob warning; bundle generation completed.

## Deploy Verification

PASS:
- Clean pm2 restart from `ecosystem.config.js`: deleted and restarted `meet-poc-be` and `meet-poc-fe` with `MEET_DB_PATH`, `MEET_RECORDINGS_DIR`, and E2E variables unset.
- `pm2 save`: PASS.
- `curl -fsS -I http://localhost:4700/`: PASS, HTTP 200.
- `curl -fsS http://localhost:4700/`: PASS, served rebuilt Angular index with `main-57FHZYQU.js`.
- `curl -fsS http://localhost:4720/api/ice-config`: PASS, backend API responded.
- pm2 env hygiene check: PASS. `meet-poc-be` and `meet-poc-fe` online; no `MEET_DB_PATH`, `MEET_RECORDINGS_DIR`, `E2E_BASE_URL`, `E2E_BACKEND_PORT`, `E2E_FRONTEND_PORT`, `E2E_PROXY_PORT`, or `E2E_WS_ORIGIN`.

## TEST_ROOM01

PASS by scope. This batch did not mutate room seed data or live room records.
