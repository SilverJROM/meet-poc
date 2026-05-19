# Test Report — B2

## Commands

```bash
npm run build
cd backend && npm test
```

## Build

PASS — `tsc -p backend/tsconfig.json` completed with exit code 0.

## Vitest

PASS — 12 test files, 19 tests.

Tail:

```text
✓ tests/signaling-room-full.test.ts (1 test) 118ms
✓ tests/auth-me-logout.test.ts (2 tests) 245ms
✓ tests/signaling-auto-admit.test.ts (1 test) 102ms
✓ tests/migrate-from-json.test.ts (1 test) 96ms
✓ tests/sessions-ttl.test.ts (1 test) 102ms
✓ tests/passwords.test.ts (1 test) 101ms

Test Files  12 passed (12)
     Tests  19 passed (19)
  Start at  01:31:49
  Duration  4.50s (transform 99ms, setup 0ms, collect 909ms, tests 2.42s, environment 1ms, prepare 403ms)
```

## Flakes

None observed after the final listener-order fix in `signaling-wire-format.test.ts`.

## Notes

Tests use real SQLite databases in temporary files, Supertest against the real Express app, and real `ws` clients connected to ephemeral HTTP servers. No WebSocket protocol mocks are used.
