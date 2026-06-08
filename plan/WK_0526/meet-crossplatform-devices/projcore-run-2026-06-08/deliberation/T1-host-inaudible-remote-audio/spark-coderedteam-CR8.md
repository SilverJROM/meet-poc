# spark CODE red-team CR8 (lens L8: adjacent-feature regression)

## Per-feature: recorder / transcripts / screen-share / lobby+input-device / watchdog — OK or regression (file:line)

- Recorder/recording: **OK**. Recording still sources audio from the raw peer streams map, not the remote-audio service mixer. `syncRecorderPeerStreams(this.peers(), this.recorder)` remains wired in an effect, and `recorder.start()` still receives `this.remoteStreams()` plus local stream directly (`frontend/src/app/pages/room/room.page.ts:700`, `frontend/src/app/pages/room/room.page.ts:1318`).
- Transcripts/speaker-frames: **OK**. No transcript path reads from the removed tile/remote-mixer path; remote audio changes do not alter transcript fetch or speaker-frame rendering paths (`frontend/src/app/pages/transcripts/transcripts.page.ts:69`, `frontend/src/app/services/active-speaker.service.ts:41`, `frontend/src/app/pages/room/room.page.ts:632`, `frontend/src/app/pages/room/room.page.ts:700`).
- Screen-share: **OK**. `remoteStreams`/`remoteScreenStreams` and mid reconciliation continue to use publisher stream maps, and tile rendering uses stream-based video/audio separation; the removed inline tile `<audio>` element was intentionally dropped in favor of per-publisher registry and does not affect share video tiles (`frontend/src/app/services/sfu-client.service.ts:953`, `frontend/src/app/services/sfu-client.service.ts:968`, `frontend/src/app/components/tile/tile.component.html:15`, `frontend/src/app/services/sfu-client.service.ts:1771`, `frontend/src/app/services/sfu-client.service.ts:1955`).
- Lobby self-test / input-device / mic preview: **OK**. Device refresh, mic-capture preflight self-test, and selected-device reconciliation still execute and now route speaker output with registry-aware filtering (`frontend/src/app/pages/room/room.page.ts:2191`, `frontend/src/app/pages/room/room.page.ts:2632`, `frontend/src/app/pages/room/room.page.ts:2355`, `frontend/src/app/pages/room/room.page.ts:2656`, `frontend/src/app/pages/room/room.page.ts:2674`).
- Watchdog / keepalive / interaction recovery: **OK**. Lifecycle continues to start/stop keepalive/watchdog in-state and rearm on registry changes, with recovery path routed through the registry `recoverPlayback` path (`frontend/src/app/pages/room/room.page.ts:2710`, `frontend/src/app/pages/room/room.page.ts:2691`, `frontend/src/app/pages/room/room.page.ts:2683`, `frontend/src/app/services/remote-audio.service.ts:321`, `frontend/src/app/services/remote-audio.service.ts:608`).
- Any NEW regression / missed prior-lens gap: **partial**. `selectedSpeakerUnavailable` remains stale across call boundaries because it is still not reset in `cleanupCall()` (`frontend/src/app/pages/room/room.page.ts:2175`, `frontend/src/app/pages/room/room.page.ts:2434`).

## CR7 consistency fix re-verify: holds

- Re-verify target passes: `remoteAudioBlocked` is now strictly derived from `remoteAudioBlockingReason` at aggregate level (`frontend/src/app/services/remote-audio.service.ts:632`) and room mirrors that directly (`frontend/src/app/pages/room/room.page.ts:642`).
- I did **not** observe the CR7 divergence between reasoned blocking and banner state in the new path.

## NEW bugs (table)

| severity | area | issue | file:line | notes |
|---|---|---|---|---|
| high | UI state hygiene (call lifecycle) | `selectedSpeakerUnavailable` not reset in `cleanupCall()` can leak stale “speaker unavailable” state between calls | `frontend/src/app/pages/room/room.page.ts:2175`, `frontend/src/app/pages/room/room.page.ts:2434` | Identified in CR7 and still present |

STATUS: BUGS
