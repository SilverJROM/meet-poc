# Batch B5 — Scenarios

## R5a — 406 not lastGumError

| ID | Given | When | Then |
|----|-------|------|------|
| S1 | `/api/sfu/tracks` returns HTTP 406 | `diagnosticsGumError(err)` runs | Returns `null` — error is NOT written to `lastGumError` |
| S2 | Mic permission denied (`code: denied`) | `diagnosticsGumError(err)` runs | Returns `{ name, message }` — real GUM errors still populate device layer |
| S3 | Subscribe 406 captured in `lastSubscribeFailureEvidence` | `buildLayerDiagnostics()` runs | `layerDiagnostics.subscribe.httpStatus === 406` and `layerDiagnostics.device.lastGumError === null` |

## R5b — Per-layer payload fields

| ID | Given | When | Then |
|----|-------|------|------|
| S4 | In-call with SFU signals populated | `buildDiagnosticsPayload()` runs | `layerDiagnostics` includes device, publish, subscribe, recovery, playout, remoteInbound |
| S5 | `sfuDiagnostics.inboundTracks` has audio rows | Payload built | `layerDiagnostics.remoteInbound` mirrors per-publisher bytes/energy/concealed |
| S6 | `lastRecoveryEvent` set | Payload built | `layerDiagnostics.recovery.lastRecoveryEvent.rung` present |

## R5c — Advertised-not-subscribed obvious + actionable

| ID | Given | When | Then |
|----|-------|------|------|
| S7 | Peer has `advertisedSubscribed: false` | Diagnostics page renders latest entry | "Advertised not subscribed" block visible with publisher name, track names, action hint |
| S8 | `layerDiagnostics.subscribe` shows HTTP 406 | Diagnostics page renders | "Layer diagnostics" grid shows Subscribe row with `HTTP 406` in bad styling |
| S9 | Persisted diagnostics entry with layer fields | Playwright opens `/app/diagnostics` | Screenshot captures per-layer grid + advertised-not-subscribed (not login/blank) |