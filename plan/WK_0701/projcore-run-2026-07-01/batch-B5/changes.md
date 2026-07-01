# Batch B5 — Changes

## Root cause

`diagnosticsGumError()` accepted any error with a `message`, so SFU subscribe failures (e.g. HTTP 406 from `/api/sfu/tracks`) could be mislabeled as `lastGumError` even though that field is intended for device/getUserMedia failures only. Recovery signals from B1–B4 existed but were not surfaced as separate per-layer diagnostics fields.

## Code changes

### `frontend/src/app/services/diagnostics-gum-error.ts` (new)
- Extracted `diagnosticsGumError()` with `isLastGumErrorCandidate()` gate — device/GUM-only.

### `frontend/src/app/services/diagnostics-layer-snapshot.ts` (new)
- `buildLayerDiagnostics()` wires existing signals into `DiagnosticsLayerSnapshot` (device, publish, subscribe, recovery, playout, remoteInbound, advertisedNotSubscribed gaps).

### `frontend/src/app/services/meeting-sessions.service.ts`
- Added `DiagnosticsLayerSnapshot` and related types; `DiagnosticsPayload.layerDiagnostics?` field (additive).

### `frontend/src/app/pages/room/room.page.ts`
- `buildDiagnosticsPayload()` populates `layerDiagnostics` from existing SFU/remote-audio signals; removed inline `diagnosticsGumError()`.

### `frontend/src/app/pages/diagnostics/diagnostics.page.ts` + `.html` + `.scss`
- Layer diagnostics summary grid + prominent "Advertised not subscribed" block with bad styling and action hints.

### `frontend/src/app/services/diagnostics-layer-honesty.spec.ts` (new)
- Outcome tests: 406 → subscribe layer, NOT `lastGumError`; page row builders surface HTTP 406 + gap row.

### `e2e/tests/sfu-b5-diagnostics-layer/sfu-diagnostics-layer.spec.ts` (new)
- Posts admitted diagnostics with `layerDiagnostics`; screenshots diagnostics page showing layers + advertised-not-subscribed.

## Out of scope (unchanged)

- No recovery logic changes (R2/R3/R4 coordinator, retry, rejoin, publish escalation).