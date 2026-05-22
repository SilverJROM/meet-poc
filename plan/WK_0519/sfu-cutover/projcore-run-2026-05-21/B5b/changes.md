# B5b Changes — Screenshare as a separate published video track over the SFU (SR-5 part 2)

## Summary

Screenshare is now published as a SEPARATE video track/transceiver over the SFU (not replaceTrack on the camera sender). Camera and screen have independent lifecycles. Remote peers receive the screen as a distinct stream rendered in the share layout.

## Files changed

### `frontend/src/app/services/sfu-client.service.ts`

**New state:**
- `private screenSender: RTCRtpSender | null` — stores the screen transceiver sender
- `readonly remoteScreenStreams = signal<Map<string, MediaStream>>(new Map())` — screen streams keyed by publisher clientId

**New public methods:**
- `publishScreen(displayTrack)` — enqueues `doPublishScreen`
- `stopScreen()` — enqueues `doStopScreen`

**`doPublishScreen`:** adds screen as a NEW transceiver (`pc.addTransceiver(displayTrack, {direction:'sendrecv'})`), `createOffer` → `setLocalDescription` → reads new transceiver's mid → `POST /api/sfu/tracks` (offer SDP + `[{location:'local', mid, trackName:pid:ts:screen:uuid}]`) → `setRemoteDescription(answer)`. Stores `screenSender` and appends `{trackName, kind:'screen', mid, status:'live'}` to `localPublishState.tracks`.

**`doStopScreen`:** `PUT /api/sfu/tracks/close {tracks:[{mid:screenMid}]}` (with renegotiation handling if CF requires it), marks screen track `status:'closed'` in `localPublishState.tracks`, clears `screenSender`.

**`ontrack` handler updated:** routes `entry.kind === 'screen'` tracks to `remoteScreenStreams` signal instead of `remoteStreams`. Camera/audio still route to `remoteStreams`.

**`handleSfuPresence` updated:** detects screen track addition (`!prevHadScreen && nowHasScreen`) → calls `subscribeNewScreenTrack(publisher)` for mid-call screen start. Detects screen track removal (`prevHadScreen && !nowHasScreen`) → calls `tearDownScreenSubscription(clientId)`.

**`subscribeNewScreenTrack`:** partial subscribe for just the screen track, guarded by trackName (skips already-subscribed). Calls `doSubscribeTracks` (new shared helper).

**`doSubscribeTracks`:** extracted from `doSubscribe` to support both full-subscribe and partial-subscribe (screen only). `doSubscribe` now delegates to it. Full renegotiation handling inside the enqueue op.

**`tearDownScreenSubscription`:** removes clientId from `remoteScreenStreams`, finds and removes screen mids from `subscribedTracks`/`midToEntry`, enqueues `doClose` for the screen mid.

**`tearDownPeerSubscription` updated:** also clears `remoteScreenStreams` on peer leave.

**`destroy()` updated:** clears `screenSender` and `remoteScreenStreams`.

### `frontend/src/app/pages/room/room.page.ts`

**`sharingPeer` (updated):** SFU-aware — checks local peer `screenOn` first, then iterates `sfuClient.remoteScreenStreams()` for remote SFU sharers. Falls back to mesh `peers().find(p => p.screenOn)` in non-SFU mode.

**`shareStream` (updated):** for non-local SFU peers, returns `sfuClient.remoteScreenStreams().get(peer.id)` instead of `peer.stream`.

**`anyScreenShareActive` (updated):** adds `(isSfuMode() && sfuClient.remoteScreenStreams().size > 0)` for remote SFU screen shares.

**`sfuPeers` (updated):** sets `screenOn: screenStreams.has(clientId)` for each remote publisher.

**`toggleScreen()` (updated):** routes SFU mode to new `toggleScreenSfu()`.

**`toggleScreenSfu()` (new):** calls `media.toggleScreen(sfuCallback)` where `sfuCallback` detects start vs. stop by checking `localPublishState.tracks.some(t => kind==='screen' && status==='live')` at callback time (correct for both button stop AND native browser "Stop sharing" via track.onended). `try/finally` ensures `announceSfuPublishState()` always fires even if SFU ops have non-fatal errors.

**`announceSfuPublishState()` (new):** sends `sfu-publish` ws message with all currently live tracks (camera + screen, or just camera after screen stops).

**`__meetDebug`:** exposes `sfuRemoteScreenStreams` for test assertions.

### `e2e/tests/sfu-b5b-screenshare/sfu-screenshare.spec.ts` (new)

2-client e2e test:
- Mocks `navigator.mediaDevices.getDisplayMedia` via `page.addInitScript` to return a `getUserMedia({video:true})` stream (works with `--use-fake-device-for-media-stream`)
- A starts screen share → assert A's `sfuPublishState.tracks` has a live screen track
- B receives distinct screen stream → assert `sfuRemoteScreenStreams.size === 1`
- Verify A's camera video still flowing on B's side while screen active
- A stops screen share → assert B's `sfuRemoteScreenStreams.size === 0`
- Verify A's camera video still flowing after screen stopped

**Result: 1/1 PASS, 32.8s**

## Key design notes

- Screen renegotiation uses the same publish-style round-trip as `doPublish` (client creates offer, posts with offer SDP, receives and sets CF answer). NOT `replaceTrack` — that's only for no-renegotiation camera toggle (B5a).
- Camera sender (`videoSender`) is completely untouched by screen publish/stop.
- Mid-call screen subscribe (`subscribeNewScreenTrack`) is needed because `subscribeIfNeeded` guards on `subscribedClientIds` (peer already subscribed for camera/audio). A separate partial-subscribe path handles the new screen track.
- Stop announce uses `try/finally` to ensure `sfu-publish` (without screen) is sent even if CF close has a non-fatal error, so B always tears down.
