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

## DIAG1CF Cloudflare Completion

- `npm test -w backend -- ice-config.test.ts`
  - PASS, 7 passed.

- `npm run build -w backend`
  - PASS.

- `npm test -w backend`
  - PASS, 100 passed, 1 skipped.

- `pm2 restart meet-poc-be`
  - PASS, backend restarted and remained online.

- Live mint check:
  - Command used: `curl -s http://localhost:4720/api/ice-config`
  - Evidence below lists URLs only; minted username/credential were intentionally not copied.
  - Returned URLs:
    - `stun:stun.l.google.com:19302`
    - `stun:stun1.l.google.com:19302`
    - `stun:stun.cloudflare.com:3478`
    - `turn:turn.cloudflare.com:3478?transport=udp`
    - `turn:turn.cloudflare.com:3478?transport=tcp`
    - `turns:turn.cloudflare.com:5349?transport=tcp`

- Run-1 regression with DIAG1:
  - Command: `npm test -w e2e -- tests/v3-diag1-conn tests/v3-fixc8-transcriber-config tests/v3-fixc7-question-library tests/v3-fixc4-transcript-tools tests/v3-fixc3-share-reflow tests/v3-fixc2-device-modal tests/v3-fixc1-camera-light tests/v3-fixb4-transcripts tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1`
  - PASS, 69 passed.
