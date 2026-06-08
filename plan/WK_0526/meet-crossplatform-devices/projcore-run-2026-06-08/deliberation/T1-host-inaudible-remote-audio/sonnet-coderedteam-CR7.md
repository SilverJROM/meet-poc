# sonnet CODE red-team CR7 (lens L7: state-machine + lifecycle)

## State-machine: contradictory/stuck/lying combinations

### B1 — DIAGLIE-SINK: `remoteAudioBlockedReason` lies for actively-playing entries [`remote-audio.service.ts:641`]

**The inconsistency.** When a sink apply times out (or returns `'failed'`) but the subsequent `el.play()` succeeds, the entry ends up in this state:
```
sinkApplyTimedOut = true  (or sinkApplyResult = 'failed')
blocked = false              ← play() succeeded; onPlaying fired
el.paused = false            ← audio is playing
playbackFailure = null
voiceStalled = false
```

Two functions disagree on whether this peer is blocked:

| Path | Returns | Reality |
|------|---------|---------|
| `refreshBlockedState()` / `blockedPeerIds` | NOT blocked (`false \|\| false \|\| (paused=false && ...)`) | correct — audio is audible |
| `remoteAudioBlockedReason(entry)` | `'sink-failed'` (first check: `sinkApplyTimedOut \|\| sinkApplyResult === 'failed'`) | **lie** |

Result: `remoteAudioBlocked` signal (banner) shows CLEAR ✓, but `perPublisher[].blockedReason = 'sink-failed'` while that publisher is NOT in `blockedPeerIds`. The diagnostics payload carries `blockedPeerIds = []` alongside a per-publisher entry with `blockedReason = 'sink-failed'` — a direct internal contradiction for the same session snapshot. An operator reading the diagnostics would conclude this peer's audio is broken when it is audible.

**Root cause — sinkApplyTimedOut is sticky in `addPublisher()`.**  
`remote-audio.service.ts:494-499`: the timeout branch sets `sinkApplyTimedOut = true` and never clears it after `el.play()` succeeds. The only path that clears it is `replayRegistryElements()` (which sets it to `false` unconditionally on sink re-apply — `remote-audio.service.ts:576,580`). Because the banner is already clear, no recovery attempt fires immediately; the next forced clear arrives via the 15 s keepalive. In the window between initial publish and the first keepalive, all diagnostic snapshots show `blockedReason = 'sink-failed'` for a peer whose audio is playing.

The same lie occurs in `replayRegistryElements()` when `sinkApplied === 'failed'` but `el.play()` succeeds (`remote-audio.service.ts:574-596`): `sinkApplyResult = 'failed'` is written at line 575 and the `el.play()` success path at line 587 sets `blocked = false` but never touches `sinkApplyResult`. Same contradiction.

**Scope.** This is a diagnostics lie, not a user-visible banner bug. The banner is correct. But any automated or human triage that reads `blockedPeerIds` + `perPublisher.blockedReason` together gets contradictory data, which undermines the value of the diagnostics added in FIX5.

---

### B2 — STALE-selectedSpeakerUnavailable: stale "speaker unavailable" across rejoin [`room.page.ts:2433-2505`]

`selectedSpeakerUnavailable` is never reset in `cleanupCall()`. If a call ends with `selectedSpeakerUnavailable = true` (selected speaker was unavailable or fell back), it remains `true` through the lobby period of the next call. The effect that re-checks and corrects it (line 669-682) only fires when `state === 'in-call'`; in the lobby it is never driven. On a `rejoinAfterInitialPublishFailure` path (the most likely same-session rejoin), the device dialog shows a stale "Selected speaker is unavailable" warning that was inherited from the previous call, not the current device state.

This is the CR2 "unlocked class" — a field that survives `cleanupCall()` because it was added after the original reset block and not back-ported.

---

### B3 — STALE-forceRelayDiagnosticRequested: stale relay flag bleeds into call 2 diagnostics [`room.page.ts:503, 3540-3543`]

`forceRelayDiagnosticRequested` and `forceRelayDiagnostic` are not reset in `cleanupCall()`. If a user triggers `forceRelayDiagnostics()` in call 1, all of call 2's diagnostic payloads include `forceRelay: true` and the stale relay diagnostic result from call 1. Server-side analysis would incorrectly attribute call 2's connection quality to an intentional relay test. Minor in practice (debug-only trigger) but is a clean-cut stale-state leak of the CR2 class.

---

### B4 — wrong `blockedReason` when voiceStalled and blocked co-occur [`remote-audio.service.ts:640-647`]

When the `onPaused` DOM event fires while a voice-stall watchdog has already latched (`voiceStalled = true`), the entry holds both `blocked = true` AND `voiceStalled = true`. `remoteAudioBlockedReason` returns `'voice-stalled'` (checked at line 643 before `'paused'` at line 644), masking the actual triggering event (`'paused'`). Functionally the recovery path (`recoverVoicePlayout → replayRegistryElements`) calls `el.play()` and resolves both, so there is no stuck state and no false banner. The only effect is a misleading diagnostic reason. Low severity.

---

### B5 — narrow async race: voiceStalled=true despite mutedAll=true [`room.page.ts:2787-2820`]

Sequence of events:
1. `pollRemoteVoiceWatchdog` reads `mutedAll() = false` at line 2787 → `decideVoiceRecovery` returns an action (e.g. `'resume'`).
2. User calls `setMutedAll(true)` while `await this.remoteAudio.recoverVoicePlayout(...)` is suspended at line 2820.
3. `setMutedAll(true)` clears all `voiceStalled` flags (line 242-244).
4. `recoverVoicePlayout` resolves → calls `setVoiceStalled(peerId, true)` → banner shows blocked despite `mutedAll = true`.

Self-healing: the next watchdog tick (≤1500 ms) executes the `mutedAll` early-return at line 2730, calls `clearVoiceStalls()`, and the banner clears. Window is ~1500 ms max. Very narrow: requires the mute gesture to land exactly inside the `el.play()` await inside `recoverVoicePlayout`. Not user-reproducible intentionally but real.

---

### Consistent combinations (no bugs found)

- `playbackFailure = 'unsupported'` + `el.paused = true`: correctly excluded from aggregate blocked (`(paused && !playbackFailure) = false`); banner stays clear; `blockedReason = 'playback-unsupported'` correctly set. Banner and per-publisher agree that this is an unsupported-browser non-recoverable state.
- `voiceStalled = true` + `mutedAll = true` (normal path): `setMutedAll(true)` clears all stalls synchronously at line 242-244 before any other code runs. Safe in the non-racy path.
- `sinkApplyResult = 'default-fallback'` + `blocked = true` (mid-play intermediate): transient; `refreshBlockedState` sees `blocked = true` → shows banner; `remoteAudioBlockedReason` returns `'paused'` or `'autoplay'` (not `'sink-failed'`). Consistent.
- `sinkApplyResult = 'selected'` in all recovery paths: clean.

---

## Reset hygiene: any field leaking stale state across calls?

| Field | Reset in? | Status |
|-------|-----------|--------|
| `RemoteAudioService.unlocked` | `reset()` line 428 | ✓ clean |
| `RemoteAudioService.selectedSinkId` | `reset()` line 429 | ✓ clean |
| `RemoteAudioService.effectiveSinkId` | `reset()` line 430 | ✓ clean |
| `RemoteAudioService.usedDefaultSinkFallback` | `reset()` line 431 | ✓ clean |
| `RemoteAudioService.mutedAll` | `reset()` line 432 | ✓ clean |
| `RemoteAudioService.voiceRecoveryCounters` | `reset()` lines 436-439 | ✓ clean |
| `RemoteAudioService.registry` | `clearRegistry()` in `reset()` | ✓ clean |
| `RoomPage.remoteVoiceWatchdogPeers` | `stopRemoteVoiceWatchdog()` in `cleanupCall()` | ✓ clean |
| `RoomPage.micSilenceWindow` | `stopMicSilenceWatchdog()` in `cleanupCall()` | ✓ clean |
| `SfuClientService.subscribeMidConflictWarnings` | `closeLiveTracksForExit()` in `cleanupCall()` | ✓ clean |
| `RoomPage.selectedSpeakerUnavailable` | **MISSING from `cleanupCall()`** | **✗ leaks (B2)** |
| `RoomPage.forceRelayDiagnosticRequested` | **MISSING from `cleanupCall()`** | **✗ leaks (B3)** |
| `RoomPage.forceRelayDiagnostic` | **MISSING from `cleanupCall()`** | **✗ leaks (B3)** |
| `RoomPage.signalingResyncCount` | Not reset | tolerable (counter, not banner state) |

---

## NEW bugs (table)

| ID | File:line | Severity | Description |
|----|-----------|----------|-------------|
| B1 | `remote-audio.service.ts:641, 494-499, 574-596` | MEDIUM | `remoteAudioBlockedReason` returns `'sink-failed'` for a playing entry (`sinkApplyTimedOut` or `sinkApplyResult='failed'` sticky after play success) — `blockedPeerIds=[]` contradicts `perPublisher[].blockedReason='sink-failed'` in same payload; diagnostic lie |
| B2 | `room.page.ts:2433-2505` | LOW | `selectedSpeakerUnavailable` not reset in `cleanupCall()`; stale "speaker unavailable" shown in lobby on rejoin until re-entry to `in-call` |
| B3 | `room.page.ts:503, 3540-3543` | LOW | `forceRelayDiagnosticRequested` and `forceRelayDiagnostic` not reset in `cleanupCall()`; call 2 diagnostic payloads inherit stale `forceRelay:true` from call 1 |
| B4 | `remote-audio.service.ts:640-647` | LOW | `remoteAudioBlockedReason` priority: `'voice-stalled'` masks `'paused'` when both flags co-occur; wrong diagnostic reason but banner and recovery are correct |
| B5 | `room.page.ts:2787-2820` | VERY LOW | Narrow async race: `setMutedAll(true)` during `recoverVoicePlayout` await sets `voiceStalled=true` despite `mutedAll=true`; false banner for ≤1500 ms |

---

## Sub-probe 4: Privacy / redaction / oversize

**Raw device IDs in payload.** `buildDiagnosticsPayload()` sends raw `selectedAudioDeviceId`, `selectedAudioOutputId`, `selectedVideoDeviceId` (room.page.ts:3533-3535), and `remoteAudioPlayout.perPublisher[].sinkId` (remote-audio.service.ts:406) to the server. Device IDs are stable per-browser fingerprints; combined with ICE candidate IP addresses already in the payload, the stored entry is meaningfully sensitive. The diagnostics _display_ (`diagnostics.page.ts:104`) hashes sink IDs with `shortHash()` but the raw value is stored server-side. **Ensure `/api/meeting-sessions/${sessionId}/diagnostics` (GET) enforces owner-only access** — a non-owner participant who can read the stored payload gets raw device IDs and network addresses for all peers.

**Payload size.** No oversize concern observed: `perPublisher` grows linearly with remote peer count (≤8 peers); ICE candidate pair data and inbound track stats are constant-sized objects. No unbounded collections in the payload path.

---

STATUS: BUGS — worst: B1 sinkApplyTimedOut/sinkApplyResult='failed' not cleared after play() success, causing per-publisher blockedReason='sink-failed' while blockedPeerIds is empty and audio is playing (diagnostic lie in remote-audio.service.ts:641)
