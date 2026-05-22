# B6b Changes — Subscriber simulcast layer preference (SR-6 part 2)

Commit: bc94bb2  
Branch: feat/sfu-cutover

## Summary

Subscribers request the appropriate simulcast layer when subscribing to a remote camera track. Mobile receivers request LOW ('l'), desktop receivers request HIGH ('h'). When any screenshare is active in the room, camera layers are deprioritized to LOW so the shared content gets priority (JROM's "prioritize the demo" goal). Layer switching is serialized through the existing enqueue() queue and applied via PUT /api/sfu/tracks/update.

## Files changed

### `frontend/src/app/services/sfu-client.service.ts`
- Injected `ViewportService` to read `isMobile()` signal
- Added `preferredCameraRid()` → `'l'` if mobile, `'h'` if desktop
- Added `isAnyScreenActive()` → true if `remoteScreenStreams.size > 0` OR local screen track is live
- Added `cameraRidNow()` → `'l'` if any screen active, else `preferredCameraRid()`
- Modified `doSubscribeTracks`: camera tracks (`kind === 'video'`) in the POST `/api/sfu/tracks` body now include `{ preferredRid, priorityOrdering, ridNotAvailable: 'degrade' }`. Audio and screen tracks unchanged.
- Added `public updateCameraLayer(): Promise<void>` → enqueues `doUpdateCameraLayer()`
- Added `private doUpdateCameraLayer()` → finds all camera mids in `midToEntry` (kind='video'), issues PUT `/api/sfu/tracks/update` with current `cameraRidNow()` preferences; no-op if no camera mids subscribed

### `frontend/src/app/pages/room/room.page.ts`
- Added `effect()` that watches `anyScreenShareActive()` (reactive); when it changes, calls `sfuClient.updateCameraLayer()` (no-op on init since no mids yet)
- Added debug hooks: `sfuUpdateCameraLayer` + `sfuSubscribedTracks` (localhost only)
- Added type declarations for the two new debug hook fields

### `e2e/tests/sfu-b6b-layer-pref/sfu-layer-pref.spec.ts` (new)
- 2-client test: desktop A + mobile B (viewport 375×667 → isMobile()=true)
- Captures POST /api/sfu/tracks subscribe requests via `page.on('request', ...)`
- Asserts desktop subscribe request has `preferredRid:'h'`, `priorityOrdering:['h','m','l']`, `ridNotAvailable:'degrade'`
- Asserts mobile subscribe request has `preferredRid:'l'`, `priorityOrdering:['l','m','h']`, `ridNotAvailable:'degrade'`
- Captures PUT /api/sfu/tracks/update; calls `sfuUpdateCameraLayer()` debug hook; asserts update has `preferredRid:'h'` (desktop, no screenshare)
- Regression: framesDecoded > 0 on both sides after layer update (checked last to maximize CF tolerance)

## Test results

| Test | Result | Time |
|------|--------|------|
| B6b layer-pref | PASS | 5.2s (solo) |
| B4a + B6a + B6b (parallel) | 3/3 PASS | 18.7s |

Note: The *active* RID being served by CF is not observable in headless inbound-rtp stats. Tests assert the REQUEST carried the correct preferredRid + that layer switching does not break the stream.

## Backend

No changes. `/api/sfu/tracks/update` already exists (B1) and `forwardBody` passes track fields through to CF unchanged.
