# codex55 CODE red-team CR13 (lens L13: CRITICAL talk/record/see)

## TALK (be-heard / hear-others): any CRITICAL break?

No CRITICAL break found in current TALK paths.

- Be-heard publish path still creates audio/video sendonly transceivers, registers only live sender tracks with CF, and marks publish `published` with track mids after the CF answer: `frontend/src/app/services/sfu-client.service.ts:1687`, `frontend/src/app/services/sfu-client.service.ts:1715`, `frontend/src/app/services/sfu-client.service.ts:1725`, `frontend/src/app/services/sfu-client.service.ts:1742`, `frontend/src/app/services/sfu-client.service.ts:1753`.
- Hear-others subscribe path still reacts to roster publishers after local publish, skips only self/already-subscribed/no-track publishers, retries on subscribe failures, and does not seed remote entries under CF's empty `mid`: `frontend/src/app/pages/room/room.page.ts:680`, `frontend/src/app/services/sfu-client.service.ts:165`, `frontend/src/app/services/sfu-client.service.ts:172`, `frontend/src/app/services/sfu-client.service.ts:175`, `frontend/src/app/services/sfu-client.service.ts:1824`.
- The current remote audio playout no longer depends on tile-local `<audio>` elements; `RemoteAudioService.syncPeers()` registers remote audio tracks from peer streams, appends hidden body-level audio elements, applies sink before play, replays on recovery/gesture, and exposes blocked state: `frontend/src/app/services/remote-audio.service.ts:258`, `frontend/src/app/services/remote-audio.service.ts:450`, `frontend/src/app/services/remote-audio.service.ts:499`, `frontend/src/app/services/remote-audio.service.ts:502`, `frontend/src/app/services/remote-audio.service.ts:523`, `frontend/src/app/services/remote-audio.service.ts:577`.

## RECORD (audio+video captured): any CRITICAL break?

Yes. [CRITICAL] Recording cannot capture video in the current implementation, so it breaks the CR13 RECORD capability as defined by the packet: "RECORD captures correct audio+video."

Evidence:

- `RecorderService.start()` creates only an `AudioContext` destination and constructs `MediaRecorder` on `dest.stream`; that stream is audio-only: `frontend/src/app/services/recorder.service.ts:117`, `frontend/src/app/services/recorder.service.ts:119`, `frontend/src/app/services/recorder.service.ts:149`.
- The service adds local and remote streams only via `addStream()`, which rejects streams with no audio tracks and only connects `createMediaStreamSource(stream)` into the audio destination. It never adds any video track or composed video/canvas track to the recorder stream: `frontend/src/app/services/recorder.service.ts:134`, `frontend/src/app/services/recorder.service.ts:135`, `frontend/src/app/services/recorder.service.ts:288`, `frontend/src/app/services/recorder.service.ts:292`, `frontend/src/app/services/recorder.service.ts:297`, `frontend/src/app/services/recorder.service.ts:298`.
- Room recording starts with `this.recorder.start(localStream, this.remoteStreams(), ...)`, but those video-bearing streams are reduced to the audio mixer inside the recorder. The UI status also describes the feature as an audio mix: `frontend/src/app/pages/room/room.page.ts:1315`, `frontend/src/app/pages/room/room.page.ts:1321`.

Classification: [CRITICAL] because any host recording path produces no recorded video, even when local/remote cameras or screen share are visible.

## SEE (video received): any CRITICAL break?

No CRITICAL break found in current SEE paths.

- Remote camera/video tracks are added to per-publisher `remoteStreams` on `ontrack`; screen tracks are added to `remoteScreenStreams`: `frontend/src/app/services/sfu-client.service.ts:937`, `frontend/src/app/services/sfu-client.service.ts:943`, `frontend/src/app/services/sfu-client.service.ts:950`, `frontend/src/app/services/sfu-client.service.ts:953`, `frontend/src/app/services/sfu-client.service.ts:959`.
- `RoomPage.peers()` merges SFU `remoteStreams` into remote peer state and `shareStream()` reads `remoteScreenStreams` for screen-share video: `frontend/src/app/pages/room/room.page.ts:327`, `frontend/src/app/pages/room/room.page.ts:332`, `frontend/src/app/pages/room/room.page.ts:337`, `frontend/src/app/pages/room/room.page.ts:439`, `frontend/src/app/pages/room/room.page.ts:443`.
- Tile video still binds to `videoStream()` and sets the `<video>` `srcObject`; the removed tile audio element does not remove or gate tile video rendering: `frontend/src/app/components/tile/tile.component.html:14`, `frontend/src/app/components/tile/tile.component.html:15`, `frontend/src/app/components/tile/tile.component.ts:26`, `frontend/src/app/components/tile/tile.component.ts:27`, `frontend/src/app/components/tile/tile.component.ts:46`, `frontend/src/app/components/tile/tile.component.ts:50`.

## Findings

1. [CRITICAL] Recording is audio-only, so RECORD does not capture video. `frontend/src/app/services/recorder.service.ts:149` records `dest.stream` from `createMediaStreamDestination()`, while `addStream()` only connects audio via `createMediaStreamSource()` and never includes video tracks (`frontend/src/app/services/recorder.service.ts:288`, `frontend/src/app/services/recorder.service.ts:297`). Any recording made while cameras/screen share are visible will miss video.

No [NON-CRITICAL] findings under the CR13 lens.

STATUS: CRITICAL-BUG — recording path does not capture video, so RECORD audio+video capability is broken.
