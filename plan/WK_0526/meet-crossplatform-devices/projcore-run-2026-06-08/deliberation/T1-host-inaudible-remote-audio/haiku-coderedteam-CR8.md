# HAIKU CODE RED-TEAM CR8 (lens L8: adjacent-feature regression sweep)

## Per-Feature Regression Analysis

### 1. Recorder / Recording
**Status: CLEAN**

Evidence:
- `RecorderService.start()` takes `peerStreams: Map<string, MediaStream>` (recorder.service.ts:114)
- Streams added via `addStream(clientId, stream)` mounted directly to own AudioContext (line 135–136)
- `room.page.ts` calls `recorder.start(localStream, this.remoteStreams(), ...)` (line 1318)
- `remoteStreams()` returns peer.stream from `this.peers()` — raw MediaStreams, not routed via remote-audio element registry
- No dependency on remoteAudioMixer, outputPlaying, or audio element selection path

**Result:** Recording captures peer streams directly, unaffected by remote audio element routing changes.

---

### 2. Transcripts / Speaker Frames
**Status: CLEAN**

Evidence:
- Transcripts page does NOT reference remoteAudio, mixer, or audioLevel signals (grep transcripts.page.ts)
- Active speaker detection uses `ActiveSpeakerService` which analyzes peer stream audio energy independently
- Watchdog writes voice stalls to registry, but transcripts/speaker display derives from peer metadata + active-speaker frame, not audio element state
- `room.page.ts` effect at line 104–108 captures speaker frame for transcript segment when `isRecording() && activeFrame`

**Result:** Speaker identification independent of audio element playback state; no regression path.

---

### 3. Screen Share
**Status: CLEAN**

Evidence:
- Screen streams managed via `remoteScreenStreams` signal (sfu-client.service.ts:93)
- Screen subscribe/unsubscribe uses separate ontrack handler path; does not re-use audio element selector
- `applySpeakerDevice()` selects `'audio:not([data-remote-audio])'` — explicitly excludes remote audio elements from local device apply
- Screen layout tiles render video only; no audio element dependency for screen

**Result:** Screen share subscribe/publish independent of remote audio element routing; no regression.

---

### 4. Lobby Self-Test / Mic Preview / Input-Device Selection
**Status: CLEAN**

Evidence:
- `changeAudioInputDevice()` calls `replaceInCallAudio(deviceId)` — mic/camera device selection (room.page.ts:950–978)
- Input device selection routes through MediaStreamTrack constraints, not HTMLAudioElement sink routing
- `applySpeakerDevice()` (line 2646) applies output device AFTER input device changes; two independent paths
- Lobby self-test polls active-speaker RMS and mic-energy independently; no remoteAudioMixer dependency
- Device selection effect at line 669–676: `if (state() !== 'in-call' || !deviceId) return; applySpeakerDevice(deviceId)` — output device applied via registry.applyOutputDevice()

**Result:** Input device selection + lobby self-test unaffected by remote audio element routing; output device correctly routed through registry.

---

### 5. Watchdog / Keepalive / Interaction-Recovery
**Status: CLEAN**

Evidence:
- Remote voice watchdog (line 2755–2825 in room.page.ts) calls:
  - `markVoiceStalled(peerId)` → sets entry.voiceStalled = true in registry
  - `clearVoiceStalls([peerId])` → clears stall latch
  - `recoverVoicePlayout(peerId, action, deviceId)` → calls registry.recoverVoicePlayout()
- Keepalive effect (line 635–648): `setInCallActive()` and `syncPeers()` driven by state signal
- Keepalive timer at line 2698: `recoverRemoteAudio('keepalive')` calls `this.remoteAudio.recoverPlayback()` — re-applies output device and replays elements
- All watchdog entry points still present and wired to registry methods (lines 2732, 2746, 2764, 2777, 2783, 2802, 2821)

**Result:** Watchdog and keepalive fully integrated with registry; voiceStalled latch in place; no regression.

---

## CR7 Consistency Fix Re-Verification

**Status: FAIL — All 4 CR7 bugs remain unfixed**

### CR7-1: sinkApplyResult stale after successful play
**File:line:** remote-audio.service.ts:463–469, 648–654

Current state:
```typescript
const onPlaying = () => {
  entry.blocked = false;
  entry.playbackFailure = null;
  this.refreshBlockedState();  // ← Does NOT reset sinkApplyResult
};
```

Issue: If sink apply previously failed (sinkApplyResult='failed'), onPlaying does not clear it. blockedReason will still report 'sink-failed' even though audio is playing. **Banner lies.**

---

### CR7-2: blocked field doesn't track el.paused in real time
**File:line:** remote-audio.service.ts:462–475, 648–654

Current state:
- blocked field updated only on play/pause events
- blockedReason reads el.paused directly (line 652: `if (entry.el.paused)`)
- Race: blocked can be false but el.paused=true if pause event fires and refreshBlockedState not yet called

No new regression in CR8, but **inconsistency persists.**

---

### CR7-3: sinkApplyResult='unsupported' not in blockedReason enum
**File:line:** remote-audio.service.ts:648–654

Current state:
```typescript
if (entry.sinkApplyTimedOut || entry.sinkApplyResult === 'failed') return 'sink-failed';
// ← 'unsupported' never checked
```

sinkApplyResult='unsupported' (browser doesn't support setSinkId) is stored but blockedReason ignores it. Diagnostics shows 'unsupported' but no blocked reason explains why. **Silent gap.**

---

### CR7-4: unlocked field leaks across calls via setInCallActive(false)
**File:line:** remote-audio.service.ts:424–429, 430–437

Current state:
```typescript
setInCallActive(active: boolean) {
  if (this.inCall === active) return;
  this.inCall = active;
  this.generation += 1;
  if (!active) this.clearRegistry();  // ← Does NOT reset unlocked, selectedSinkId, etc.
}

reset() {
  this.unlocked = false;  // ← Only reset here
  this.selectedSinkId = undefined;
  // ...
}
```

If reset() not called (only setInCallActive(false) → setInCallActive(true) sequence), service fields leak. playoutDiagnostics() exports stale unlocked=true from previous call. **State leak confirmed.**

---

## NEW Bugs Found (CR8-specific)

| Bug ID | Severity | File:Line | Issue | Symptom |
|--------|----------|-----------|-------|---------|
| CR8-1  | CRITICAL | 651       | playbackFailure logic inverted | `if (entry.playbackFailure) return null;` should explain failure type, not hide it. Element that failed to play shows no blocked reason. |

---

## Summary

No **adjacent-feature regressions** detected in L8 sweep:
- Recorder, transcripts, screen-share, input-devices, watchdog all unaffected
- Audio element routing changes isolated to remote audio playback path
- All dependent features still correctly wired to registry signals

However: **CR7 consistency fix did NOT land.** All 4 CR7 bugs + 1 new CR8 logic bug remain.

Recommendation: **CR7-1/2/3 and CR8-1 must be fixed before shipping** to avoid field diagnostics misinterpretation and cross-call state leaks.

---

## STATUS

**BUGS — CR7 not fixed (1,2,3,4 remain), CR8-1 new playbackFailure logic issue**

Honest assessment: CR8 lens clean on adjacent features, but CR7 unified blocked-derivation fix **did not apply.** State machine still inconsistent.
