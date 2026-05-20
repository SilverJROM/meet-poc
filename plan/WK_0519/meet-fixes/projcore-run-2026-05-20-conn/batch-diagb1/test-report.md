# DIAGB1 Test Report

## PASS
- `npm run build`
- `npm test -w backend`
- `npm test -w backend -- signaling-knock-admit.test.ts`
- `E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- e2e/tests/v3-diagb1-lobby/diagb1-lobby.spec.ts`
- `E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- e2e/tests/v3-mb4-lobby/lobby-mobile.spec.ts`

## Partial Compatibility Pass
- `E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- e2e/tests/v3-fixc2-device-modal/device-modal.spec.ts e2e/tests/v2-b5-lobby/lobby-device-selector.spec.ts e2e/tests/v3-mb4-lobby/lobby-mobile.spec.ts`
- Result: 7 passed before `v3-mb4-lobby` S3.4 failed due an obsolete expectation that the mobile mic-preview pill is visible by default. The test was updated to the new DR-6 collapsed-device-test behavior and `v3-mb4-lobby/lobby-mobile.spec.ts` then passed 4/4.

## Screenshots
- `screenshots/quick-join.png`
- `screenshots/quick-join-expanded.png`
- `screenshots/empty-name-error.png`
- `screenshots/live-knocker.png`
