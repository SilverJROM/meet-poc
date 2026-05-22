# B2 changes — SR-2: Frontend SFU client publish path + operation queue

## What changed

**New: `frontend/src/app/services/sfu-client.service.ts`**
- `SfuClientService` — Angular `Injectable({ providedIn: 'root' })`
- `localPublishState: Signal<LocalPublishState | null>` — reactive publish state (`cfSessionId`, `status`, `tracks[]`)
- `enqueue<T>(op)` — single serialized Promise-chain queue for all PC-mutating operations (subscribe/close/update/renegotiate in later batches will reuse this)
- `publish({ clientKey, participantId, sessionId, localStream })` — runs through the queue; full CF publish flow:
  1. ICE = CF STUN (`stun:stun.cloudflare.com:3478`) first + existing TURN creds as fallback
  2. `addTransceiver` for audio; `addTransceiver` for video — pre-negotiated even if camera off (DR-55/F2)
  3. `createOffer` → `setLocalDescription`
  4. `POST /api/sfu/session` → `cfSessionId`
  5. `POST /api/sfu/tracks` with offer SDP + `{location:'local', mid, trackName}` for each live sender track; trackName = `{participantId}:{epoch}:{kind}:{uuid}`
  6. `setRemoteDescription(answer)`
  7. Persist `SfuTrackModel[]` (trackName/kind/mid/status) — close/update are mid-based in later batches
- `getStats(): Promise<RTCStatsReport | null>` — test hook for outbound-rtp assertions
- `destroy()` — closes PC, resets signal
- Bug found and fixed during testing: CF's `/sessions/{id}/tracks/new` requires the SDP offer in the request body (`sessionDescription: { type, sdp }`) to generate an answer; omitting it results in `setRemoteDescription` parse error

**Modified: `frontend/src/app/pages/room/room.page.ts`**
- Import `SfuClientService, type LocalPublishState` from the new service
- Inject `sfuClient = inject(SfuClientService)`
- Admitted handler: `?sfu=1` query param gates `sfuClient.publish(...)` (additive, mesh default untouched)
- `window.__meetDebug` Angular effect: adds `sfuPublishState: this.sfuClient.localPublishState()` (reactive)
- localhost-only block: adds `debug.sfuGetStats = () => this.sfuClient.getStats()`
- `ngOnDestroy`: calls `this.sfuClient.destroy()`
- `Window` interface: adds `sfuPublishState?: LocalPublishState | null` and `sfuGetStats?: () => Promise<RTCStatsReport | null>`

**New: `e2e/tests/sfu-b2-publish/sfu-publish.spec.ts`**
- Playwright e2e with fake media (`--use-fake-device-for-media-stream` already in config)
- Test flow: loginAsJrom → createRoomViaApi → goto `room.url?sfu=1` → check "Start with camera on" in lobby → wait for `localVideoTrackId` truthy → fill display name → Join → wait for `.call-panel`
- Assertions:
  - `sfuPublishState.cfSessionId` truthy (CF session created)
  - `sfuPublishState.status === 'published'`
  - `sfuGetStats()` returns `outbound-rtp` entries with kind `'audio'` AND `'video'`
- 1/1 pass; 8.2s total (real CF network call)

## Why

SR-2: the SFU client publish path is the foundation for all subsequent SFU batches (subscribe B4, toggles B5, simulcast B6, renegotiate B7). The operation queue is load-bearing — established here so later batches can drop operations in without risk of concurrent PC mutation.

## Build + test result

- `npm run build` — clean (0 errors; pre-existing stencil glob warning)
- `B2: SFU client publishes audio+video to Cloudflare` — 1/1 pass (8.2s)
- Commit: `97900bd feat(sfu): B2 SFU client publish path + operation queue (SR-2)`
