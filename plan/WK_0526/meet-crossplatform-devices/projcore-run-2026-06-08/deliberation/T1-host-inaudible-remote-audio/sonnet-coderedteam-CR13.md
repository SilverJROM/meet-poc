# sonnet CODE red-team CR13 (lens L13: CRITICAL talk/record/see)

## TALK (be-heard / hear-others): any CRITICAL break? (file:line) or none

**Be-heard (outbound):** none. The publish path (`doPublish` → audioTransceiver → CF SFU) is intact. Mid-call track replacement flows through `replaceAudioTrack` / `replaceAudioTrackAndPublishIfNeeded` → `audioSender.replaceTrack` (sfu-client.service.ts:1378-1413). No path strands a publisher's outbound audio.

**Hear-others (remote playout, the fix):** none. Per-publisher `<audio>` registry in `RemoteAudioService` is correct:

- `syncPeers` (remote-audio.service.ts:258) filters to remote peers with a live audio track, calls `addPublisher` for new or changed entries and `removePublisher` for departed ones. Idempotent.
- `addPublisher` (remote-audio.service.ts:450) guards ended tracks at line 451, creates a `<audio>` element, applies sink (2s timeout), calls `el.play()`, all in that order.
- Late-joiner after gesture: `el.play()` succeeds because gesture permission is browser-scoped; if not yet unlocked → `blocked=true` → `remoteAudioBlocked` signal fires → `installRemoteAudioInteractionRecovery` → next user interaction calls `recoverRemoteAudio` → `replayRegistryElements` for all entries including the late joiner.
- Async race during sink apply: if `isEntryCurrent` returns false (replaced by a newer `addPublisher` call), the old entry is destroyed and the new entry takes over — no stranded audio (remote-audio.service.ts:503-506).
- Mid-guard permanent stranding: `subscribedClientIds` is cleared on retry (sfu-client.service.ts:183), on reconnect (`handleSfuPresence` at line 1087-1091 resets on new cfSessionId), and on `clearPublisherSubscriptionStateForRetry` (line 1168). Live-mid-conflict retry cap (2 retries, line 295) does not permanently stop — logs warn and awaits fresh presence state; on the next cfSessionId change the guard is reset.
- `doSubscribeTracks` idempotency check at line 1782 (`isTrackSubscribed`) prevents double-subscribe.

## RECORD (audio+video captured): any CRITICAL break? or none

**Audio:** none. `RecorderService` uses a Web Audio mixer graph (`ctx.createMediaStreamSource` → `connect(dest)` → `MediaRecorder` on `dest.stream`). `syncRecorderPeerStreams` (room.page.ts:697) calls `addPeerStream` for each remote peer every time `peers()` changes. `addPeerStream` (recorder.service.ts:164) calls `addStream`, which validates audio tracks at line 292 and creates the source node. AudioContext resume on lifecycle is handled (FIX1). No path where the recording is silent unless the peer stream genuinely has no audio tracks (correct behavior).

**Video:** The recorder has never captured video — it records `dest.stream` which is the audio destination node's output only (recorder.service.ts:148-149). Audio-only recording is by design for this POC. Not a regression.

## SEE (video received): any CRITICAL break? or none

None. The tile's `<video>` element path is entirely separate from the audio fix:

- `tile.component.ts:46-52`: `video.muted = true; video.srcObject = this.videoStream()` — only video tracks are rendered.
- `videoStream()` (tile.component.ts:26) = `displayStream() ?? peer().stream` where `peer().stream` comes from `sfuClient.remoteStreams()`.
- `remoteStreams` is populated in `processOntrack` (sfu-client.service.ts:952-960) via `stream.addTrack(event.track)` for non-screen kinds. Both audio and video tracks land in the same `MediaStream`; the video element displays video while muted.
- Screen share video: `remoteScreenStreams` is a separate signal (sfu-client.service.ts:944-951), displayed independently via the share layout. Not affected.
- The audio fix (removing the tile `<audio>` element and routing audio through `RemoteAudioService`) does not touch the `<video>` element or `remoteStreams` signal wiring.

## Findings (each tagged [CRITICAL] or [NON-CRITICAL], file:line)

**[NON-CRITICAL]** `remoteAudioBlockingReason` returns `null` for `playbackFailure === 'aborted'` and `'unsupported'` (remote-audio.service.ts:651). When `AbortError` is thrown from `el.play()`, the element is paused and `entry.blocked=false` (line 538), so no banner is shown and interaction recovery is not triggered. Recovery still happens via the keepalive timer (`startRemoteAudioKeepalive` → `recoverRemoteAudio` → `replayRegistryElements`) and the `hasSources` branch of the effect (room.page.ts:656-660). Not a permanent silence — just a missing banner for one error type.

**[NON-CRITICAL]** Sink apply timeout (2s) sets `entry.sinkApplyResult='failed'` and `entry.blocked=true` (remote-audio.service.ts:507-511), but `el.play()` still runs immediately after (line 524), potentially playing through whatever speaker the browser defaulted to. The UI banner will show "sink-failed" even though audio may be audible on the default speaker. Cosmetic discrepancy only.

**[NON-CRITICAL]** Recording is audio-only (recorder.service.ts:149: `new MediaRecorder(dest.stream, ...)`). Video was never captured. Pre-existing design; not a regression.

---

STATUS: CRITICAL-CLEAN — no CRITICAL break of talk/record/see (three non-critical items listed above)
