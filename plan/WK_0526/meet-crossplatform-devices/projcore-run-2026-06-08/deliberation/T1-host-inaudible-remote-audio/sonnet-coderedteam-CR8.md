# sonnet CODE red-team CR8 (lens L8: adjacent-feature regression)

## Per-feature analysis

---

### 1. Recorder / recording — OK

The `RecorderService` builds its audio mix with its own dedicated `AudioContext` and uses
`createMediaStreamSource(stream)` wired directly to each peer's raw WebRTC `MediaStream`.
This path is entirely independent of `RemoteAudioService`'s per-publisher `<audio>` elements.

Wiring chain:
- `room.page.ts:700` — `effect(() => syncRecorderPeerStreams(this.peers(), this.recorder))`
- `room-recording.ts:16` — `recorder.addPeerStream(peer.id, peer.stream)` for every non-local peer
- `recorder.service.ts:297` — `this.ctx.createMediaStreamSource(stream)` → connects to `dest`

`peer.stream` is populated from `sfuClient.remoteStreams()` (raw `ontrack` events from the SFU),
so the audio track is the actual WebRTC-received track — the same source that was always available.
The removal of the shared AudioContext mixer in `RemoteAudioService` has zero effect here because
the recorder never used that mixer; it always sourced from `peer.stream` directly.

`addPeerStream` guards on `!stream || !this.isRecording()` so null-stream peers are skipped safely,
and the reactive `peers()` effect re-fires when `remoteStreams()` is updated with a newly arrived
stream, so late-arriving tracks are picked up automatically.

No regression.

---

### 2. Transcripts / speaker frames — OK

`ActiveSpeakerService` has its own `AudioContext` (separate from both the recorder's and the old
remote-audio mixer's). It observes `peers()` via `room.page.ts:632` and adds an `AnalyserNode`
per peer that reads directly from `peer.stream` (`createMediaStreamSource(new MediaStream([track]))`).

There is no dependency on `outputPlaying`, `remoteAudioMixer`, or the `<audio>` element registry.
The speaker-frame signal (`activeFrame`) feeds `RecorderService`'s `captureSpeakerFrame()` for
transcript segments — this path is also unaffected.

No regression.

---

### 3. Screen-share — OK

Screen tracks arrive via `sfuClient.processOntrack()` with `entry.kind === 'screen'` and go into
`remoteScreenStreams` (a separate map from `remoteStreams`). The `tearDownScreenSubscription()`
method (`sfu-client.service.ts:1318`) correctly removes the screen MID entries and clears the
`remoteScreenStreams` entry when a peer stops sharing.

The subscribe rollback / mid-guard changes (idempotency fix, mid-call subscribe retry) apply
uniformly to all track kinds without special-casing screen. The FIX3 `doSubscribeTracks` idempotency
guard checks `isTrackSubscribed(clientId, trackName)` before adding, which is correct for screen
tracks as well.

`applySpeakerDevice` uses selector `audio:not([data-remote-audio])`, which correctly excludes the
per-publisher audio elements (they carry `el.dataset['remoteAudio'] = id`, i.e.
`data-remote-audio` attribute, `remote-audio.service.ts:455`). Screen `<video>` elements (in tile
components) are still picked up by the `video` selector and sink-routed correctly.

The `peers` computed correctly derives `screenOn: identity.screenOn || screenStreams.has(clientId)`
and `sharingPeer` reads `sfuClient.remoteScreenStreams()` directly. No tile layout regression.

No regression.

---

### 4. Lobby self-test / mic preview / input-device selection — OK

**Lobby self-test (`lobbySelfTestFlag`)**: Uses `classifyMicCapture` over `media.getMicLevel()` on
the local capture stream. No dependency on `RemoteAudioService`.

**Active-speaker analyser (UI-only)**: Own `AudioContext`; reads `peer.stream` directly. Clean.

**Input device selection** (`changeAudioDevice`, `replaceInCallAudio`): Routes through `media.*`
and `sfuClient.replaceAudioTrackAndPublishIfNeeded`. No `RemoteAudioService` involvement in the
*acquire* path. `RemoteAudioService.syncPeers()` is called by the `peers()` effect and picks up
stream changes reactively.

**`applySpeakerDevice`** (line 2646): Correctly two-phase:
1. `querySelectorAll('video, audio:not([data-remote-audio])')` — applies to all *non-registry*
   media elements (tile videos, local preview, etc.)
2. `this.remoteAudio.applyOutputDevice(deviceId)` — applies to registry elements separately

The `[data-remote-audio]` exclusion matches exactly the `el.dataset['remoteAudio'] = id` set in
`RemoteAudioService.addPublisher()`. No element is double-applied or missed.

No regression.

---

### 5. Watchdog / keepalive / interaction-recovery — OK

**No double-fire:**
- `startRemoteAudioKeepalive()` early-returns on `this.remoteAudioKeepaliveTimer` (line 2692).
- `startRemoteVoiceWatchdog()` early-returns on `this.remoteVoiceWatchdogTimer || state !== 'in-call'`
  (line 2709).
- `installRemoteAudioInteractionRecovery()` early-returns on
  `this.remoteAudioInteractionRecoveryInstalled` (line 2825).

**No timer leaks:** `cleanupCall()` calls `stopRemoteVoiceWatchdog()`, `stopRemoteAudioKeepalive()`,
and `uninstallRemoteAudioInteractionRecovery()` — all three are cleaned up before call state is
torn down.

**Lifecycle events correctly fire into the registry:** The effect at line 644 reads
`this.remoteAudio.sourcesVersion()` (bumped by `refreshBlockedState()` on any playout-state change)
so keeper + watchdog arm immediately after the first source is added. Recovery paths
(`keepalive`, `interaction`, `visibility`, `effect`) all route through
`remoteAudio.recoverPlayback()` → `replayRegistryElements()` which iterates the registry correctly.

**`resumeAfterLifecycleFreeze`** (line 2877) calls `this.recorder.resumeAudioContext()` on
`pageshow` if recording is active. This is correctly guarded with `this.recorder.isRecording()`.
The `recorder.resumeAudioContext()` handles the iOS paused-context case introduced in FIX1.

No regression.

---

## CR7 consistency fix re-verify: HOLDS

**Single source of truth**: `remoteAudioBlockingReason(entry)` drives both `refreshBlockedState()`
(which writes `remoteAudio.remoteAudioBlocked` signal) and `allSinksPlaying()` (which is the return
basis for `unlockAndPlayRemoteSinks()`). The function (`remote-audio.service.ts:648`) returns `null`
= not blocked, non-null = blocked:

```
sink-failed  → sinkApplyTimedOut || sinkApplyResult === 'failed'
voice-stalled → voiceStalled
(null path)  → playbackFailure is a non-blocking error
autoplay / paused → el.paused (with blocked flag tiebreaker)
```

**Agreement across state product:**
- `refreshBlockedState`: `blocked = entries.some(r => remoteAudioBlockingReason(r) !== null)`
- `allSinksPlaying`: `entries.every(r => remoteAudioBlockingReason(r) === null)`
- Empty registry: both yield `blocked = false`, `allSinksPlaying = true` — consistent.
- Non-empty registry: `blocked` ↔ `!allSinksPlaying` — consistent by De Morgan.

**Room-page `remoteAudioBlocked` write sites:**
1. Effect (line 638-643): reads `this.remoteAudio.remoteAudioBlocked()` directly — always agrees.
2. `recoverRemoteAudio()` (line 2685): reads `this.remoteAudio.remoteAudioBlocked()` after await — agrees.
3. `unlockAudioFromGesture()` (line 2669): sets `!allPlayable` where `allPlayable = allSinksPlaying()`.
   This is mathematically `remoteAudio.remoteAudioBlocked()` for non-empty registry (and both are
   `false` for empty registry). Consistent.

**`selectedSpeakerUnavailable` reset:** Reset to `false` in `startLobbyPreflight()` (line 2175),
which is called on every lobby entry path — including `rejoinAfterInitialPublishFailure()` which
calls `cleanupCall()` then `startLobbyPreflight()`. For `directLeave()` paths, the component is
destroyed/navigated away, so no stale state carries over to a new session.

---

## NEW bugs — none

No new regressions or bugs found in this lens sweep.

---

STATUS: CLEAN — no regression, consistency holds
