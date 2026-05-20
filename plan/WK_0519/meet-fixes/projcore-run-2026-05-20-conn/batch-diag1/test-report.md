# Batch DIAG1-A Test Report

## PASS

- `npm test -w backend -- ice-config.test.ts`
  - 4 passed.

- `npm run build -w backend`
  - PASS.

- `npm run build -w frontend`
  - PASS.
  - Existing Stencil empty-glob warning only.

- `E2E_BACKEND_PORT=4721 E2E_FRONTEND_PORT=4712 E2E_PROXY_PORT=4713 E2E_BASE_URL=http://localhost:4713 E2E_WS_ORIGIN=ws://localhost:4713 npm test -w e2e -- e2e/tests/v3-diag1-conn/reliability-core.spec.ts`
  - 2 passed.
  - Verified fetched ICE config is used by peer connections.
  - Verified forced failed ICE state triggers `restartIce()`, creates an `iceRestart: true` offer, and logs `selectedCandidateType=relay`.

- `npm test -w backend`
  - 97 passed, 1 skipped.

## Full E2E Attempt

- `E2E_BACKEND_PORT=4721 E2E_FRONTEND_PORT=4712 E2E_PROXY_PORT=4713 E2E_BASE_URL=http://localhost:4713 E2E_WS_ORIGIN=ws://localhost:4713 npm test -w e2e`
  - 109 passed.
  - 16 failed.
  - 5 did not run.

The new Batch A tests passed in the full run. The failing tests were distributed across older call-ui, recording, transcript, and mobile suites. Observed failure signatures included missing generated recording files, `room not found` in socket helpers, raw media query audit findings in pre-existing SCSS, and mobile-layout assertions outside Batch A scope.

## Evidence

- Screenshot: `screenshots/batch-a-call-connected.png`
