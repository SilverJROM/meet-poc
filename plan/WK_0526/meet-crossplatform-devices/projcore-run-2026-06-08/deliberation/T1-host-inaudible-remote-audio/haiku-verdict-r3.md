# Haiku verdict — T1 round 3 (red-team)

## Blockers found in the fix plan

### BLOCKER 1: CRITICAL — Volume/Mute/Feedback-Limiter regression (non-negotiable)

**What breaks:** Consensus proposes retiring the mixer from the audible path and using per-publisher `<audio>` elements directly. But the mixer is the ONLY place volume/mute-all/feedback-limiter are applied.

**Evidence:**
- Mixer provides volume control via gain.gain.value (remote-audio.service.ts:516)
- Mixer provides mute-all via gain.gain.value = 0 (remote-audio.service.ts:197)
- Mixer provides feedback limiter via DynamicsCompressor (remote-audio.service.ts:521-527, FEEDBACK_LIMITER_PARAMS:58)
- Controls-bar invokes setVolume() and setMutedAll() on remoteAudio service (controls-bar.component.ts:109,121)
- Per-publisher `<audio>` elements have NO volume control, NO mute mechanism, NO limiter (tile.component.ts:56-67 just sets srcObject and plays)

**The regression:**
- User adjusts volume slider → remoteAudio.setVolume() operates on orphaned mixer (nobody listens) → **volume change has NO EFFECT**
- User toggles mute-all → remoteAudio.setMutedAll() operates on orphaned mixer → **mute-all has NO EFFECT**
- Same-room feedback loop → **no limiter to suppress peaks** → **audio distorts or triggers speaker feedback**

**File:line to fix:** This REQUIRES consensus to clarify the architecture:
- Option A: Keep mixer in the audio chain (per-publisher streams → mixer → output element) — requires A3 hardening but means A1/A4 still apply. DISSENT path.
- Option B: Apply per-element gain/mute via Web-Audio GainNode per tile (new approach; tile.component.ts:56-67 would need to construct or connect to a GainNode) — major refactor.
- Option C: Hybrid — mixer stays for control (volume/mute work) but per-element elements are PRIMARY output for robustness (mixer not listened to) — loses all control functions, unacceptable.

**Blocking decision:** Consensus does NOT state how to preserve volume/mute/feedback on the per-element path. This MUST be resolved before implementation.

---

### BLOCKER 2: MEDIUM — B guard mid-overwrite could break subscribe on legitimate CF mid reuse

**What breaks:** Consensus proposes "refuse cross-publisher mid overwrite at sfu-client.service.ts:1753" — but the implementation is unspecified. A naive guard could throw or silently drop a publisher.

**Evidence — the risk:**
sfu-client.service.ts:1748-1756 (no-renegotiation path):
```typescript
for (const rt of responseTracks) {
  if (!rt.mid) continue;
  const entry = { publisherClientId: publisher.clientId, ... mid: rt.mid };
  rememberTouchedMid(rt.mid);
  this.midToEntry.set(rt.mid, entry);  // ← guard needed here?
  nextSubscribed.set(rt.mid, entry);
}
```

A guard at line 1753 that checks `if (this.midToEntry.has(rt.mid) && this.midToEntry.get(rt.mid).publisherClientId !== publisher.clientId) throw Error()` would:
1. **Legitimately block** if CF assigns the same mid to two concurrent publishers (should not happen, but if it does, should be reported as CF bug, not silently dropped)
2. **Incorrectly block** if a mid is legitimately reused: Publisher A unsubscribe (mid M freed) → Publisher B subscribe (CF assigns mid M again) → guard sees mid M already in midToEntry → rejects. Even if touched-mid rollback clears it, the initial check happens BEFORE that.

**Prove the risk — trace the timeline:**
- 00:26:45: Publisher A (peer2) subscribed, assigned mids=[M1 (audio), M2 (video)]
- 00:26:52: Publisher A connection dropped, mids freed by CF (midToEntry still has M1/M2 from A)
- 00:27:00: Publisher B (phone) subscribed, CF assigns new mids=[M3 (audio), M4 (video)]
  - If CF reuses M1 for B's audio: guard at 1753 sees M1 in midToEntry, belongs to A → **BLOCKS B's audio subscribe → B becomes silent (violates no-suppress directive)**

**File:line:** sfu-client.service.ts:1748-1756 needs:
1. Guard logic: check if mid belongs to a DIFFERENT publisher, but ONLY after clearing old publisher's mids on disconnect
2. OR: Use rollback (touchedMid) to SAVE the old state and restore it if guard fails (currently rollback only happens on HTTP error, not on guard check)
3. CRITICAL: Add explicit cleanup when a publisher disconnects — iterate through subscribedTracks and remove all mids belonging to the departing publisher BEFORE the next subscription processes

**Blocking decision:** Guard implementation is unspecified. Without clear implementation + test for 2-concurrent-publishers, this risks dropping a publisher.

---

### BLOCKER 3: MEDIUM — Autoplay on per-element path has timing/sequencing risks

**What breaks:** Per-publisher `<audio>` elements in tiles have their own autoplay logic (tile.component.ts:63), separate from the mixer unlock. The interaction between non-gesture tile play and gesture-based room unlock could fail if sequenced wrong.

**Evidence:**
tile.component.ts:56-67 (effect, non-gesture context):
```typescript
effect(() => {
  const audio = this.remoteAudio()?.nativeElement;
  const stream = this.peer().isLocal || !this.remoteAudioEnabled() ? null : this.peer().stream;
  if (!audio) return;
  if (audio.srcObject !== stream) audio.srcObject = stream;
  audio.muted = false;
  if (!stream) return;
  void audio.play().catch((err) => {  // ← non-gesture, will fail
    console.debug('[media] remote audio autoplay blocked', err);
    this.remoteAudioBlocked.emit();
  });
});
```

room.page.ts:2661-2673 (gesture unlock):
```typescript
private async unlockAudioFromGesture(showPromptOnFailure: boolean): Promise<boolean> {
  this.activeSpeaker.unlock();
  const micPreviewUnlock = this.media.activateMicPreview().catch(...);
  const remoteAudioUnlock = this.remoteAudio.unlockAndPlayRemoteSinks(...);
  // ...
}
```

remote-audio.service.ts:282-292 (plays mixer + tile elements):
```typescript
const elements = Array.from(document.querySelectorAll<HTMLAudioElement>('audio[data-remote-audio]'));
await Promise.all(
  elements.map(async (audio) => {
    await this.applySinkId(audio, deviceId);
    try {
      await audio.play();
    } catch (err) { ... }
  }),
);
```

**The risk scenarios:**

1. **Peer arrives BEFORE user gestures:**
   - Tile effect calls play() (non-gesture) → blocked → emits remoteAudioBlocked
   - User sees banner and clicks
   - unlockAudioFromGesture calls unlockAndPlayRemoteSinks
   - unlockAndPlayRemoteSinks plays the tile element again (in gesture context) → should succeed
   - **Path is OK**

2. **Peer arrives AFTER user has already gestured:**
   - User clicks, unlockAudioFromGesture runs, context resumed, mixer element played
   - New peer joins, tile effect calls play() → now context is running, so play() should succeed
   - **Path is OK** (assuming context stays running)

3. **Peer arrives, tile effect runs, play() succeeds, THEN context becomes suspended:**
   - Tile element is playing
   - AudioContext becomes suspended (e.g., via tab-inactivity timer, or GC if no sources)
   - Tile element cannot output (context suspended) → **silent**
   - User sees no banner (why? tile element is playing, not blocked)
   - User doesn't click → **permanent silence**
   - **PATH FAILS** — no banner shown because element.play() succeeded (element is "playing"), but actual audio is muted by suspended context

**File:line:** The remoteAudioBlocked banner logic (room.page.ts:650-659) checks `contextState === 'running' && outputPlaying`. With per-element path:
- contextState is the SHARED AudioContext (needed by mixer, even if retired from output)
- outputPlaying is tied to the mixer output element, NOT the tile elements
- If tile elements are playing but context becomes suspended, contextState becomes 'suspended', and the banner SHOULD show
- BUT if mixer is fully retired (no mixer output element), what does outputPlaying track? → **BROKEN**

**Blocking decision:** The banner logic must be rewired to track per-element audio states, not just the mixer element's paused status.

---

## Regressions the fix would introduce (mitigation)

### Regression 1: Volume/mute-all no longer work (BLOCKER — see above)
**Mitigation:** Resolve BLOCKER 1 before implementation.

### Regression 2: No feedback limiter (loss of feature)
**Mitigation:** Either keep mixer in audio chain (A3-hardened), or add per-element or per-context limiter.

### Regression 3: Per-element sink routing fragility
**Severity:** Low (already an issue with A4, not new)
**Evidence:** applySpeakerDevice (room.page.ts:2648-2659) queries all elements and applies setSinkId. New tile elements are captured on the next selectedAudioOutputId effect run (line 685-699). Risk: element created, user hasn't changed device, sink not applied immediately.
**Mitigation:** Call applySpeakerDevice explicitly when peers() changes, not just on device-change.

### Regression 4: AutoContext lifecycle with retired mixer
**Severity:** Medium
**Evidence:** If mixer is fully retired, AudioContext is no longer used for audio output. But contextState signal is still tracked and used by banner logic. Context lifecycle becomes decoupled from actual playout.
**Mitigation:** Either keep mixer (even if not primary output), or refactor banner logic to track per-element states instead of contextState.

---

## Confirmations (fix points that survive red-team)

✓ **Per-publisher elements already exist and are wired:** tile.component.ts:14-15 has `<audio #remoteAudio data-remote-audio autoplay playsinline>` ready to use. Just need to flip the `[remoteAudioEnabled]` binding (currently `!remoteAudioMixerEnabled()`).

✓ **Autoplay rejection handling is in place:** tile.component.ts:63-66 emits remoteAudioBlocked on play() failure, room.page.ts:258 handles it and calls unlockAudioFromGesture. Flow is wired end-to-end.

✓ **setSinkId applies to per-element path:** applySpeakerDevice (room.page.ts:2648-2659) queries "video, audio" elements and applies setSinkId to all. Per-element audio elements ARE captured.

✓ **Tile-peer lifecycle is sound:** Peers are computed from peerIdentities + remoteStreams. When peer joins, new tile is rendered with the stream. When peer leaves, tile is destroyed. No mid-collision risk from tile lifecycle itself.

✓ **Mid-overwrite risk is REAL (B2 sequential, but guard is needed):** Code is additive, but adding a guard is correct defense-in-depth. **Implementation of guard must be careful** (see BLOCKER 2).

✓ **R3 diagnostics are sound:** Collecting media-playout stats + per-element state in debugSnapshot will disambiguate A3 vs A4 on the next call. No holes found.

---

## New issue / 7th mechanism (or "NONE — fix plan sound")

**NEW ISSUE FOUND: Banner logic is tied to mixer-output-element.paused, not per-element playback states.**

**Evidence:** room.page.ts:650-659:
```typescript
effect(() => {
  const contextState = this.remoteAudio.contextState();
  const outputPlaying = this.remoteAudio.outputPlaying();  // ← tied to MIXER output element
  this.remoteAudio.sourcesVersion();
  const hasSources = this.remoteAudio.debugSnapshot().mixedPeerIds.length > 0;
  ...
  const playing = contextState === 'running' && outputPlaying;
  this.remoteAudioBlocked.set(!playing);
});
```

`outputPlaying` is set to `true` when the mixer output element plays (remote-audio.service.ts:219-227). But if the mixer is retired from the audible path, there's NO mixer output element, so outputPlaying is always false → banner always shows (even if tiles are playing) OR the signal doesn't exist anymore.

**Impact:** The fix will either:
1. Show the banner even when per-element audio is playing (false positive)
2. Crash if mixer output element is removed entirely

**File:line to fix:** remote-audio.service.ts:219-227 and room.page.ts:650-659. The outputPlaying logic must be refactored to track per-element states when mixer is retired.

---

## Summary of blockers and decision gate

| Blocker | Severity | Must resolve before code | Impact |
|---------|----------|------------------------|--------|
| **BLOCKER 1: Volume/Mute/Feedback regression** | CRITICAL | YES | Fix loses user controls; unacceptable regression |
| **BLOCKER 2: B guard mid-overwrite** | MEDIUM | YES | Risk of silently dropping a publisher on CF mid reuse |
| **BLOCKER 3: Banner logic for per-element path** | MEDIUM | YES | False positives or crashes when mixer retired |

---

STATUS: REVISE — **Consensus fix plan is sound in INTENT (per-publisher elements, retire single-mixer SPOF) but INCOMPLETE in ARCHITECTURE. Three blockers must be resolved: (1) How to preserve volume/mute/feedback on per-element path (Option A: keep mixer in chain A3-hardened, Option B: per-element GainNode, Option C: specify that controls are secondary), (2) B guard implementation must explicitly handle CF mid reuse without breaking, (3) Banner logic refactor to track per-element states, not mixer.outputPlaying. Do NOT implement as-is — would lose critical UI controls and risk publisher suppression.**
