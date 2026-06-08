# gpt54 CODE red-team CR13 (lens L13: CRITICAL talk/record/see)
## TALK (be-heard / hear-others): any CRITICAL break? or none
None found in the current audio-fix path.

- Hear-others: remote playout is now registry-owned, one hidden `<audio>` per remote publisher, independent of tile rendering, with sticky unlock, sink re-apply, replay/recovery, and watchdog-based stalled-pllayout recovery. Evidence: `frontend/src/app/services/remote-audio.service.ts:258-319`, `frontend/src/app/services/remote-audio.service.ts:450-654`, `frontend/src/app/pages/room/room.page.ts:631-660`, `frontend/src/app/pages/room/room.page.ts:2681-2815`.
- Be-heard: nothing in this diff touches local publish/send; local audio publish still rides the SFU publish path and `replaceAudioTrack` path rather than the removed remote-audio tile/mixer path. Evidence: `frontend/src/app/services/sfu-client.service.ts:1667-1754`, `frontend/src/app/services/sfu-client.service.ts:388-398`.
- Publisher-suppression risk from live mid conflicts appears specifically defended now: live conflicts throw a dedicated `LiveMidConflictError`, trigger forced renegotiating resubscribe, and on cap they do not permanent-stop the publisher guard. Evidence: `frontend/src/app/services/sfu-client.service.ts:73-80`, `frontend/src/app/services/sfu-client.service.ts:175-184`, `frontend/src/app/services/sfu-client.service.ts:282-351`, `frontend/src/app/services/sfu-client.service.ts:1858-1877`.

## RECORD (audio+video captured): any CRITICAL break? or none
[CRITICAL] Recording is audio-only, not audio+video.

- `RecorderService.start()` creates an `AudioContext`, then a `MediaStreamDestination`, and instantiates `MediaRecorder(dest.stream, ...)`. `dest.stream` is the audio output of the Web Audio graph, not a composite audio+video stream. No video track is ever added. Evidence: `frontend/src/app/services/recorder.service.ts:117-120`, `frontend/src/app/services/recorder.service.ts:134-149`.
- The recorder MIME negotiation is explicitly audio-only (`audio/webm`, `audio/mp4`, `audio/aac` only), which confirms the recording path is not expected to emit video. Evidence: `frontend/src/app/services/recorder.service.ts:448-460`.
- The room UI also describes the feature as an audio mix only: `Recording (audio mix: you + admitted peers).` Evidence: `frontend/src/app/pages/room/room.page.ts:1314-1321`.
- Backend download content types are also audio-only (`audio/webm`, `audio/mp4`, `audio/aac`). Evidence: `backend/src/modules/recording/index.ts:203-215`, `backend/src/modules/recording/index.ts:526-530`.

## SEE (video received): any CRITICAL break? or none
None found in the current video receive/render path.

- Tile video rendering remains intact: tiles still bind `video.srcObject` from `displayStream() ?? peer().stream`, and only the tile-local remote `<audio>` element was removed. Evidence: `frontend/src/app/components/tile/tile.component.html:13-20`, `frontend/src/app/components/tile/tile.component.ts:26-27`, `frontend/src/app/components/tile/tile.component.ts:44-52`.
- SFU `ontrack` still routes camera/video into `remoteStreams` and screen-share into `remoteScreenStreams`, which are then read by the room page for participant tiles and share layout. Evidence: `frontend/src/app/services/sfu-client.service.ts:937-963`, `frontend/src/app/pages/room/room.page.ts:327-352`, `frontend/src/app/pages/room/room.page.ts:425-444`.

## Findings (each tagged [CRITICAL] or [NON-CRITICAL], file:line) or "none"
- [CRITICAL] Recording does not capture video at all; the recorder is built from `createMediaStreamDestination()` and records only that audio stream. `frontend/src/app/services/recorder.service.ts:117-120`, `frontend/src/app/services/recorder.service.ts:149`, `frontend/src/app/services/recorder.service.ts:448-460`
- [CRITICAL] The persisted/downloaded recording contract is audio-only end to end (`audio/*` MIME selection in frontend and `audio/*` content types in backend), so recordings cannot satisfy the packet's required audio+video record capability. `frontend/src/app/services/recorder.service.ts:448-460`, `backend/src/modules/recording/index.ts:526-530`

STATUS: CRITICAL-BUG — recording path is audio-only, so RECORD (audio+video captured) is not intact
