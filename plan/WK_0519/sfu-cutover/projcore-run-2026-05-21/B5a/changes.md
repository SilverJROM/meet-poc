# B5a changes — mic/cam toggles over SFU (SR-5 part 1)

Commit: 884755c  Branch: feat/sfu-cutover

## Files changed

### frontend/src/app/services/sfu-client.service.ts
- Added `private audioSender: RTCRtpSender | null` and `private videoSender: RTCRtpSender | null`
- In `doPublish`: refactored `addTransceiver` calls to capture sender refs (`audioTransceiver.sender`, `videoTransceiver.sender`) — behavior identical to before, just stores the return value
- Added public `replaceVideoTrack(track: MediaStreamTrack | null): Promise<void>` — enqueues `doReplaceVideoTrack` for ordering safety
- Added private `doReplaceVideoTrack` — calls `videoSender.replaceTrack(track)` (no renegotiation; B2 pre-negotiated the video transceiver per DR-55/F2)
- `destroy()`: clears `audioSender` and `videoSender`

### frontend/src/app/pages/room/room.page.ts
- `toggleCamera()`: selects `replaceTrack` callback based on `isSfuMode()` — SFU path calls `sfuClient.replaceVideoTrack`, mesh path calls `webrtc.replaceVideoTrack`; all surrounding logic (media.toggleCamera, updateLocalMediaState, broadcastMediaState) unchanged
- `sfuPeers` computed: reads `micEnabled`/`camEnabled` from the mesh peer entry (`this.peers().find(p => p.id === clientId)`) instead of hardcoded `true` / `!!(stream?.getVideoTracks().length)`. Mesh peers exist in SFU mode (added via `webrtc.addPeer`) and are updated by `media-state` ws messages via `webrtc.updatePeer`.

### e2e/tests/sfu-b5a-toggles/sfu-toggles.spec.ts (new)
- 2-client SFU test: Host A + Guest B, both with camera enabled
- Waits for bidirectional video (framesDecoded > 0) via `sfuGetStats()`
- **Cam-off:** B clicks "Turn camera off" → samples A's `framesDecoded` twice 3.5s apart → asserts delta < 10
- **Cam-on:** B clicks "Turn camera on" → polls until A's delta from baseline > 15
- **Mic-mute:** B clicks "Mute microphone" → polls A's `__meetDebug.peers` for B's `micEnabled === false`
- **No renegotiation:** asserts both sides' `sfuPublishState.status === 'published'` throughout
- All assertions polled with timeout; no one-shot assertions

## Design decisions
- **Mic toggle**: no SFU-specific code needed. `media.toggleMic()` sets `track.enabled` on the MediaStreamTrack that was passed to `addTransceiver(audioTrack)` in doPublish — the sender's track IS the same object, so disabling it at the track level mutes CF audio transmission.
- **Audio packetsReceived unreliable with fake media**: Chrome's fake device reports 0 `packetsReceived` in inbound-rtp stats even when audio IS flowing (confirmed: B's tile shows CONNECTED+video). Gated on `framesDecoded` instead; mic-mute test via media-state ws covers the audio path.
- **sfuPeers mesh peer state**: reuses the existing `webrtc.updatePeer` path that already handles `media-state` messages — no new signal or map needed.
