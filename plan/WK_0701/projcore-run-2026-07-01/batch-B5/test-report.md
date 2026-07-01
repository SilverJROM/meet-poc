# Batch B5 — Test Report

## Build

| Command | Result |
|---------|--------|
| `cd frontend && npm run build` | ✅ PASS (Stencil empty-glob warning only) |

## Targeted unit tests (timeout 25)

| Command | Result |
|---------|--------|
| `cd frontend && timeout 25 npx tsx src/app/services/diagnostics-layer-honesty.spec.ts` | ✅ PASS — `diagnostics-layer-honesty: all assertions passed` |
| `cd frontend && timeout 25 npx tsx src/app/pages/diagnostics/diagnostics.page.spec.ts` | ✅ PASS — existing helpers still green |

### Key assertions (R5a outcome)

- `diagnosticsGumError(make406Error()) === null` — 406 never becomes `lastGumError`
- `buildLayerDiagnostics(...).subscribe.httpStatus === 406` with `device.lastGumError === null`
- Subscribe diagnostics row shows `HTTP 406` with `layer-bad` class
- `advertisedNotSubscribed` gap row present for publisher `Bob`

## E2E screenshot (R5c)

| Command | Result |
|---------|--------|
| `cd e2e && E2E_BASE_URL=http://localhost:4700 timeout 170 npx playwright test tests/sfu-b5-diagnostics-layer/sfu-diagnostics-layer.spec.ts --workers=1` | ✅ PASS (1/1) |

Screenshot: `batch-B5/screenshots/b5-layer-diagnostics-advertised-not-subscribed.png`

Verified visible in screenshot:
- "Layer diagnostics" grid (Device, Publish, Subscribe, Recovery, Playout, Remote inbound)
- Subscribe row: `HTTP 406 · POST /api/sfu/tracks · session_not_found` (red)
- "Advertised not subscribed" block with Bob / bob-audio + action hint (red)