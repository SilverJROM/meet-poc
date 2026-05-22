# B4a Changes — SR-4: Subscribe to remote publisher + render tile

Commit: a9ab284 on feat/sfu-cutover

## Files changed

### `frontend/src/app/services/sfu-client.service.ts`
- Added `SubscribedTrackEntry` interface and `subscribedTracks` signal (mid → entry map)
- Added `remoteStreams` signal (clientId → MediaStream)
- Added private `callerCreds`, `subscribedClientIds`, `midToEntry` state
- Set `pc.ontrack` immediately after `new RTCPeerConnection()` in `doPublish` — before any HTTP calls — so no track event from any future subscribe is missed
- Stored `callerCreds` at the top of `doPublish` (before any `await`) so subscribe ops enqueued immediately after can read them
- Added `subscribeIfNeeded(publisher)` — skips self, already-subscribed, no-track publishers; marks clientId before enqueue to prevent double-enqueue
- Added `doSubscribe(publisher)` — runs inside `enqueue()`:
  - Guards: `!creds || publishState.status !== 'published' || !this.pc` → early return
  - `POST /api/sfu/tracks` with `location:'remote'`, publisher cfSessionId, and each trackName
  - Maps CF response `{trackName, mid}` to `midToEntry` and `subscribedTracks` signal
  - Full renegotiation inside same enqueue op: `setRemoteDescription(offer)` → `createAnswer` → `setLocalDescription` → `PUT /api/sfu/renegotiate`
- Added `getStats()` for `__meetDebug` hook

### `frontend/src/app/pages/room/room.page.ts`
- Added `isSfuMode = signal(route.snapshot.queryParamMap.get('sfu') === '1')`
- Added `sfuPeers = computed<PeerState[]>(...)` — local tile from `peers().find(p => p.isLocal)` + remote publishers mapped from `remotePublishers` signal × `remoteStreams` signal; connectionState = `stream ? 'connected' : 'connecting'`, camEnabled = truthy video tracks
- Added subscription `effect()`:
  - Guards: `!isSfuMode()` → return; `localPublishState?.status !== 'published'` → return (CRITICAL: prevents race where sfu-roster arrives before publish completes, which would call doSubscribe with null creds/pc)
  - When guard passes: iterates `remotePublishers`, skips self, calls `subscribeIfNeeded`
  - Effect re-fires when `localPublishState` transitions to 'published', re-reading current publishers
- Added `sfuGetStats` and `sfuRemoteStreams` to `window.__meetDebug`

### `frontend/src/app/pages/room/room.page.html`
- Wrapped tiles-grid in `@if (isSfuMode())` / `@else` blocks; SFU path renders `sfuPeers()` instead of `peers()`

### `e2e/tests/sfu-b4a-subscribe/sfu-subscribe.spec.ts` (new)
- 90s timeout, real CF network
- Host: loginAsJrom + createRoomViaApi + join with camera
- Guest: browser.newContext() + join with camera + ask to join; host admits
- `waitForPublished`: polls `__meetDebug.sfuPublishState.status === 'published'` (35s)
- `waitForInboundMedia`: polls `sfuGetStats()` for inbound-rtp audio `packetsReceived > 0` AND video `framesDecoded > 0` on BOTH pages (45s each)

## Key fix: subscription effect race

Root cause: `sfu-roster` WS message arrives between `await` calls in the admitted handler (before `sfuClient.publish()` is enqueued). At that point `opQueue = Promise.resolve()`, so `doSubscribe` runs immediately with `callerCreds=null`/`pc=null` and silently returns — but the clientId is already marked as subscribed, preventing retry.

Fix: guard in the effect on `localPublishState()?.status !== 'published'`. The effect returns early; when publish completes, the `localPublishState` signal update triggers the effect again, which then calls `subscribeIfNeeded` with publish fully done.

## Test result

```
✓  [chromium] › sfu-b4a-subscribe/sfu-subscribe.spec.ts:57:1 › B4a: two SFU clients each receive audio+video from the other through Cloudflare (6.1s)
1 passed (11.5s)
```
