# Test Report — B1

## Commands

```bash
npm run build
cd backend && npm test
```

## Build

PASS — `tsc -p backend/tsconfig.json` completed with exit code 0.

## Vitest

PASS — 5 test files, 7 tests.

Tail:

```text
✓ tests/migrate-from-json.test.ts (1 test) 126ms
✓ tests/sessions-ttl.test.ts (1 test) 94ms
✓ tests/passwords.test.ts (1 test) 92ms

Test Files  5 passed (5)
     Tests  7 passed (7)
  Start at  01:17:26
  Duration  1.65s (transform 65ms, setup 0ms, collect 403ms, tests 764ms, environment 1ms, prepare 168ms)
```

## Flakes

None observed.

## Notes

Tests use real `better-sqlite3` databases in per-test temporary files and Supertest against a real Express app instance. No SQLite or password crypto mocks are used.
