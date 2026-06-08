# spark CODE red-team CR13 (lens L13: CRITICAL talk/record/see)
## TALK (be-heard / hear-others): any CRITICAL break? (file:line) or none
No CRITICAL break identified in this pass. Remote playout now uses `RemoteAudioService` registry elements per remote peer with in-call synchronization and recovery loops wired from `RoomPage`:
- `frontend/src/app/pages/room/room.page.ts:632-633` — `remoteAudio.setInCallActive(...)` + `remoteAudio.syncPeers(...)` keeps remote audibles in lockstep with room state and roster.
- `frontend/src/app/services/remote-audio.service.ts:258-281` — remote peers with audio tracks are registered, old entries removed, new tracks rebound when stream/track changes.
- `frontend/src/app/services/remote-audio.service.ts:450-460` and `523-540` — hidden `<audio data-remote-audio>` elements are created from remote streams and played/recovered with error handling.
- `frontend/src/app/services/remote-audio.service.ts:315-319`, `325-326`, `321-326` — recovery actions (`recoverPlayback`, `recoverVoicePlayout`) are available and replay/restore logic is exercised.
- `frontend/src/app/pages/room/room.page.ts:641-660` — keepalive/watchdog and recovery effect runs in-call and triggers recovery when blocked or when remote sources exist.
- `frontend/src/app/pages/room/room.page.ts:2645-2654` — sink routing excludes `audio[data-remote-audio]` and applies remote output separately via `remoteAudio.applyOutputDevice(...)`.

No path was found where a published audio participant is permanently stranded/unheard due to this fix.

## RECORD (audio+video captured): any CRITICAL break? or none
No CRITICAL RECORD break observed for this patch sequence (recording start/stop wiring and peer-sync remain functional).
- `frontend/src/app/pages/room/room.page.ts:1314-1319` — host recording starts with local stream + all peer streams (`this.remoteStreams()`) and uploads result.
- `frontend/src/app/pages/room/room-recording.ts:15-25` and `frontend/src/app/pages/room/room.page.ts:697` — recorder receives stream additions/removals in reaction to peer roster changes.

[NON-CRITICAL] `frontend/src/app/services/recorder.service.ts:85-90`, `111-137`, `288-305` — recorder intentionally mixes audio via `MediaStreamAudioDestination` and records audio tracks only (no video track encoding path).

## SEE (video received): any CRITICAL break? or none
No CRITICAL SEE break identified. SFU ontrack/subscribe flow still populates remote camera streams for tiles, and tile render remains video-driven:
- `frontend/src/app/services/sfu-client.service.ts:1674-1685` — `pc.ontrack` is installed before subscribe and routed through `processOntrack`.
- `frontend/src/app/services/sfu-client.service.ts:951-963` — inbound tracks are added to `remoteStreams`; screen tracks go to `remoteScreenStreams` and track names are retained.
- `frontend/src/app/pages/room/room.page.ts:328-330`, `333-345` — peer states derive `stream` from `sfuClient.remoteStreams()` and screen map.
- `frontend/src/app/components/tile/tile.component.ts:26-27` and `.html:15` — tile video src is bound to `peer.stream`/`displayStream` and rendered as `<video autoplay ...>`.

## Findings (each tagged [CRITICAL] or [NON-CRITICAL], file:line) or "none"
[NON-CRITICAL] `frontend/src/app/services/recorder.service.ts:85-90`, `111-137`, `288-305` — recording is audio-only mix; no video track is mixed or encoded in recorder path.

STATUS: CRITICAL-CLEAN — no CRITICAL break of talk/record/see (non-critical items, if any, listed)
