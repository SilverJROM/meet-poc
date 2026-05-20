# DIAGF Test Report

## Backend

Command:

```bash
npm run build -w backend
```

Result: PASS.

Command:

```bash
npm test -w backend -- signaling-reconnect.test.ts signaling-peer-left.test.ts signaling-host-actions.test.ts
```

Result: PASS, 10 tests.

Command:

```bash
npm test -w backend
```

Result: PASS, 108 passed / 1 skipped.

## Frontend

Command:

```bash
npm run build -w frontend
```

Result: PASS. Stencil emitted its existing empty-glob warning.

## DIAGF E2E

Command:

```bash
E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- e2e/tests/v3-diagf-conn-resilience/diagf-conn-resilience.spec.ts
```

Result: PASS, 2 tests.

## Targeted Regression

Command:

```bash
MEET_DB_PATH=/tmp/meet-diagf-target.sqlite E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- tests/v3-fixb2-transcript/transcript-tagging.spec.ts:74 tests/v2-b8-sidebar/sidebar-actions-leave-speaker.spec.ts:99 --config=playwright.config.ts --workers=1
```

Result: PASS, 2 tests.

## Clean Run-1 + Diag Gate

Clean isolated DB was seeded with `TEST_ROOM01`, then the Run-1 plus diag suites were executed on isolated ports.

Command:

```bash
MEET_DB_PATH=/tmp/meet-diagf-full.sqlite E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- tests/v3-diagf-conn-resilience tests/v3-diage1-rooms-slugs tests/v3-diagd-join-audio-invariant tests/v3-diagc-weak-connection tests/v3-diagb2-conn tests/v3-diagb1-lobby tests/v3-diag1-conn tests/v3-fixc8-transcriber-config tests/v3-fixc7-question-library tests/v3-fixc4-transcript-tools tests/v3-fixc3-share-reflow tests/v3-fixc2-device-modal tests/v3-fixc1-camera-light tests/v3-fixb4-transcripts tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.config.ts --workers=1
```

Result: PASS, 89 passed.

## Non-Gate Attempt

An unfiltered `npm test -w e2e` was also attempted. It failed in known non-Run-1/legacy/parallel areas, including tests with stale slug expectations, missing seed expectations, and raw-media/mobile audit assumptions. This was not the acceptance gate for DIAGF; the clean Run-1 plus diag gate above passed.
