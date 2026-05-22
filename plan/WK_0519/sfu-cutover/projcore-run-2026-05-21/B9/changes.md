# B9 changes — SFU Diagnostics (SR-9)

## Root cause (watch-item from B4b)
The late-subscribe latency watch-item from B4b (30-60s in headless 3-client e2e) required a measurement instrument. SR-9 adds two-sided diagnostics for the SFU topology so JROM can pull forensics on real field-test calls.

## Changes

### `frontend/src/app/services/meeting-sessions.service.ts`
- Added 4 new exported types: `SfuOutboundTrackStats`, `SfuInboundTrackStats`, `SfuSubscribeLatency`, `SfuDiagnosticsSnapshot`
- Added `sfuDiagnostics?: SfuDiagnosticsSnapshot` optional field to `DiagnosticsPayload`

### `frontend/src/app/services/sfu-client.service.ts`
- Imported SFU diagnostic types from `meeting-sessions.service`
- Added private `subscribeInitiatedAt: Map<string, number>` and `subscribeFirstFrameAt: Map<string, number>` for subscribe-latency measurement
- `doSubscribeTracks`: records `subscribeInitiatedAt` at subscribe start; records `subscribeFirstFrameAt` after `midToEntry` reconciliation completes (tracks fully established)
- `pc.ontrack`: records `subscribeFirstFrameAt` if entry exists (backup path; `doSubscribeTracks` is the primary since `ontrack` fires before `midToEntry` is set)
- Added public `collectDiagnostics(): Promise<SfuDiagnosticsSnapshot | null>` that gathers from `pc.getStats()`:
  - **Candidate pair/transport**: nominated/succeeded `candidate-pair` → local/remote candidate types, RTT (ms), builds `DiagnosticsCandidatePair`
  - **Outbound (publish)**: all `outbound-rtp` stats → matched to `localPublishState.tracks` by `stat.mid` (Chrome 90+); yields one entry per simulcast layer
  - **Inbound (subscribe)**: all `inbound-rtp` stats with `stat.mid` → `midToEntry.get(mid)` → publisher identity; audio entries include jitter-buffer / concealment fields
  - **Subscribe latencies**: reads both maps → `latencyMs = firstFrameAt - initiatedAt` (null if not yet established)
- Cleared both latency maps in `tearDownPeerSubscription`, `resetForReconnect`, `destroy`

### `frontend/src/app/pages/room/room.page.ts`
- Imported `SfuDiagnosticsSnapshot` from meeting-sessions.service
- `flushDiagnosticsLog`: calls `await sfuClient.collectDiagnostics()` in SFU mode before building the payload
- `buildDiagnosticsPayload`: accepts optional `sfuDiagnostics?` parameter; spreads it into the payload if present

### `backend/src/modules/sessions/store.ts`
- `summarizeDiagnosticsPayload`: extracts `localCandidateType`/`remoteCandidateType` from `payload.sfuDiagnostics` for the `candidate_types` DB column; updates `relayUsed` if CF is using relay; uses `sfuDiagnostics.inboundTracks.length` for `peerCount` when no mesh peers present. No schema changes.

### `frontend/src/app/pages/diagnostics/diagnostics.page.ts`
- Imported `SfuDiagnosticsSnapshot`, `SfuInboundTrackStats`, `SfuOutboundTrackStats`, `SfuSubscribeLatency`
- Added helpers: `sfuDiag()`, `sfuTransportSummary()`, `sfuOutboundSummary()`, `sfuInboundSummary()`, `sfuLatencySummary()`

### `frontend/src/app/pages/diagnostics/diagnostics.page.html`
- Added `@if (sfuDiag(entry); as sfu)` section "SFU Diagnostics" per entry showing: transport (cfSessionId, connection/ice state, RTT, candidate path), publish outbound tracks (per layer), subscribe inbound tracks (per publisher), subscribe latencies

### `e2e/tests/sfu-b9-diagnostics/sfu-diagnostics.spec.ts`
- New e2e test: 2-client SFU call → waits for media flow → polls until diagnostics entry with `sfuDiagnostics` appears via API → asserts:
  - outboundTracks ≥ 1 (publish stats present)
  - inboundTracks ≥ 1 (inbound stats for remote client)
  - selectedCandidatePair != null (CF ICE resolved)
  - subscribeLatencies[0].firstFrameAtMs != null (subscribe-latency measured)
  - connection/iceConnectionState strings present (DB row persistence proven via API)
- Result: 1/1 PASS (12.0s); B4a regression 1/1 PASS

## Test result
```
✓ B9: SFU diagnostics — outbound+inbound stats + subscribe latency persisted to meeting_session_diagnostics (12.0s)
✓ B4a: regression PASS (7.0s)
```

## Fix note (iter1)
Subscribe-latency `firstFrameAtMs` was null on first run: `pc.ontrack` fires during `setRemoteDescription` BEFORE `midToEntry` is populated, so the `if (!entry) return` guard missed it. Fix: record `subscribeFirstFrameAt` at the end of `doSubscribeTracks` after `midToEntry` reconciliation (tracks fully established = correct proxy for "subscribe completed").
