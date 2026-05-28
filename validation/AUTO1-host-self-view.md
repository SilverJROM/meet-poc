# AUTO1 Host Self View Validation

## Mechanism

The host self-view tile now receives `effectiveLocalStream()` through the tile `displayStream` input when the peer is local. This makes the local camera tile depend directly on the processed stream computed from `BackgroundEffectsService.processStream()` instead of relying only on the local peer object wrapper to carry stream changes.

The SFU publish path was not changed. Remote guests still receive the existing `replaceVideoTrack` flow.

## Diff Summary

- `frontend/src/app/pages/room/room.page.html`
  - Local grid tiles pass `[displayStream]="peer.isLocal ? effectiveLocalStream() : null"`.
  - Local strip tiles pass the same override during screen-share layout.
- `e2e/tests/background-host-self-view.spec.ts`
  - Adds a two-browser SFU Playwright test.
  - Host and guest join with camera enabled.
  - Host enables blur in-call.
  - Test asserts the host local tile video track matches `window.__meetDebug.effectiveLocalStream`, not the raw camera track.
- `e2e/tests/background-effects.spec.ts`
  - Opens the current collapsible lobby background picker before selecting Blur, keeping the existing smoke test aligned with the current UI.

## Verification

- PASS: `E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 E2E_PROXY_PORT=4810 E2E_FRONTEND_PORT=4811 E2E_BACKEND_PORT=4820 npm test -w e2e -- e2e/tests/background-host-self-view.spec.ts --project=chromium`
- PASS: `E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 E2E_PROXY_PORT=4810 E2E_FRONTEND_PORT=4811 E2E_BACKEND_PORT=4820 npm test -w e2e -- e2e/tests/background-effects.spec.ts --project=chromium`
- PASS: `E2E_BASE_URL=http://localhost:4810 E2E_WS_ORIGIN=ws://localhost:4810 E2E_PROXY_PORT=4810 E2E_FRONTEND_PORT=4811 E2E_BACKEND_PORT=4820 npm test -w e2e -- e2e/tests/fixloop-banner --project=chromium` (16 passed)
- PASS: `npm run build -w frontend`
