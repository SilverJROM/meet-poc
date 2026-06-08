# Haiku verdict — T1 round 1

## Root-cause finding(s)

| # | claim | confidence | evidence file:line | anomaly |
|---|-------|-----------|-------|---------|
| 1 | **AudioContext.resume() fails in the syncPeers effect because it runs in a non-gesture (setTimeout(0)) context, leaving the context 'suspended' and blocking all audio playback.** | proven | room.page.ts:634-640 (effect with setTimeout(0)) + remote-audio.service.ts:271-276 (resume() requires gesture) | A (PLAYOUT) |
| 2 | RTP arrives at the client (bytesRecv climbing, 0 loss) but Audio Context cannot output it because context stays 'suspended' after resume() rejection. | proven | diagnostics-evidence-2026-06-08.md:8-34 (sustained bytesRecv) + remote-audio.service.ts:272-276 (non-gesture resume rejected) | A (PLAYOUT) |
| 3 | Cloudflare Calls SFU likely limits concurrent audio subscriptions to one per client (observed pattern: peer2 subscription active until 00:26:45, gap, then phone subscription starts 00:27:00). Not a client bug but explains the one-at-a-time anomaly. | hypothesis | diagnostics-evidence-2026-06-08.md:8-34 (timeline gap) | B (ONE-PUBLISHER) |

## Contributing bugs / races / alternative causes

1. **Autoplay-gesture gating broken by setTimeout wrapper (room.page.ts:637-639)**
   - The syncPeers effect computes new peers, then calls `unlockAudioFromGesture()` in `setTimeout(() => {...}, 0)`.
   - This setTimeout **exits the user-activation window**. By the time `unlockAndPlayRemoteSinks()` executes, the browser no longer recognizes a qualifying gesture.
   - Result: `context.resume()` is rejected (caught silently), context stays 'suspended', no audio output possible.
   - The effect INTENDS to unlock audio when peers arrive, but the setTimeout defeats the gesture requirement.

2. **No fallback unlock mechanism when effect-driven unlock fails**
   - The sync Peers effect (line 634-640) has no error handling or retry if the setTimeout-wrapped unlock fails silently.
   - The remoteAudioBlocked banner (line 650-660) will show because contextState is 'suspended', but there is no signal to the user that a GESTURE is needed.
   - The interactionRecovery (line 674, installRemoteAudioInteractionRecovery) is meant to install a click handler, but the timing race allows the context to be suspended before that handler is attached.

3. **Possible race: peers() computed signal updates before ontrack fires**
   - If syncPeers is called when remoteStreams is being populated by concurrent ontrack events, the stream might be briefly empty (no tracks yet).
   - currentAudioTrack (line 245-246 in remote-audio.service.ts) would return null, peer would be filtered out of remoteAudioPeers, addSource would not run.
   - On the next syncPeers call (once ontrack has fired), the peer would be added.
   - This does NOT explain sustained inaudibility (evidence shows RTP flowing continuously), but could explain initial silence or gaps.

## Fix approach (mechanism-level)

**Primary fix: Remove the setTimeout(0) wrapper from the syncPeers effect, or move unlockAndPlayRemoteSinks to a real gesture handler.**

Current (broken):
```javascript
effect(() => {
  this.remoteAudio.syncPeers(this.peers());
  if (this.state() !== 'in-call') return;
  window.setTimeout(() => {  // ← LOSES user-activation; resume() will fail
    void this.unlockAudioFromGesture(false).catch(...);
  }, 0);
});
```

**Option A (preferred): Schedule unlock on first genuine user interaction, not on peer arrival**
- Keep syncPeers in the effect (add tracks to mixer)
- Remove the setTimeout unlock attempt from the effect
- Ensure installRemoteAudioInteractionRecovery (line 674) runs early and attaches a real gesture handler
- This defers unlock to a click/touch event, guaranteeing user-activation

**Option B (interim): Call resume() synchronously before the effect exits, within the context of the effect (if called from a gesture)**
- This is fragile because effects are not gesture contexts themselves; won't help
- Don't use this; requires real gesture source

**Why this closes the goal:**
- remoteAudio.syncPeers() adds tracks to the mixer (already works)
- Once a real gesture (click/touch) arrives, installRemoteAudioInteractionRecovery will call unlockAudioFromGesture
- AudioContext.resume() will succeed (user-activation is present)
- contextState becomes 'running'
- output element plays
- remoteAudioBlocked banner clears
- Host hears audio

**Why both anomalies are explained:**
- **Anomaly A (PLAYOUT/inaudible)**: Caused by suspended AudioContext due to setTimeout-broken gesture
- **Anomaly B (ONE-PUBLISHER-AT-A-TIME)**: Caused by Cloudflare Calls SFU limiting concurrent audio subscriptions (client observes this as sequential RTP arrivals). This is not a client bug; it's a SFU policy. The client could work around it by implementing active-speaker-only subscription (subscribe to one publisher at a time and switch on silence detection), but that's out of scope for fixing playback.

## R3 diagnostics to add

**Goal: Prove decode vs sink (is audio being decoded but not output, or is it failing earlier?)**

Add these fields to inbound-rtp stat capture in sfu-client.service.ts ~line 736:

1. **`totalAudioEnergy`**: `numberOrNull(stat.totalAudioEnergy)` — sum of decoded audio energy over lifetime
   - If non-null and climbing: audio IS being decoded
   - If null or not climbing: audio may be arriving but not decoded

2. **`concealedSamples`**: Already captured at line 748, but ensure it's read correctly:
   - Non-zero = jitter buffer is filling gaps (indicates packet loss or late arrival)
   - Zero = clean decode path

3. **Per-host playout state** (new): Capture remoteAudio.debugSnapshot() in every diagnostics payload:
   - `contextState` (running/suspended/closed)
   - `outputPaused` (true if output element paused)
   - `hasSources` (mixer has any sources)
   - `outputAttached` (output element srcObject bound)
   
   **Where to add**: meeting-sessions.service.ts, add to SfuDiagnosticsSnapshot:
   ```typescript
   remoteAudioPlayout?: {
     contextState: AudioContextState | 'none';
     outputPaused: boolean;
     hasSources: boolean;
     outputAttached: boolean;
   };
   ```

4. **Fix audioLevel extraction**: inbound-rtp stats do NOT have audioLevel field. Either:
   - Remove line 749 (invalid field)
   - OR change to read from a different stat type (audio or audio-playout if available)
   - Check WebRTC spec for correct field name per track kind

**Why these matter:**
- `totalAudioEnergy` + `concealedSamples` prove the decode pipeline
- `contextState` + `outputPaused` prove the playout pipeline
- Together they localize whether the break is in decode or playout

## Holes you could NOT rule out

1. **iOS-specific AudioContext behavior**: Test on iOS to confirm AudioContext.resume() rejection pattern matches desktop. iOS autoplay policy may differ (requires very recent user interaction, not a whole gesture window).

2. **Device-specific sinkId failures**: Evidence doesn't show sinkId errors, but applySinkId (line 652-656) could fail silently if the device is unplugged or unavailable. Add error logging there.

3. **Mid-reconciliation collision on multi-track subscribe**: If peer2's audio and video are subscribed in the same doSubscribeTracks call, could the reconcileSubscribedMids (line 1724) logic get the mids wrong, causing one track to be mapped to the wrong publisher? Very unlikely given the test coverage, but possible if CF returns mids in unexpected order.

4. **Element muted attribute persisting**: bindOutputElement (line 542) sets muted=false, but if the element already has muted=true at creation, there could be a race. Confirm muted is never set to true elsewhere.

5. **Sink ID blocking autoplay**: setSinkId can trigger autoplay-blocking in some browsers. If device enumeration fails or a dead device is selected, the element might pause. Check applyMediaElementSinkWithDefaultFallback (line 85-112) for actual device availability.

STATUS: AGREE — **The root cause is AudioContext.resume() being called in a non-gesture context (setTimeout(0) in the syncPeers effect), leaving the context 'suspended' and blocking playout. Tracks and RTP arrive, but the mixer cannot output to the destination because it's orphaned in a suspended context. Fix by moving the unlock to a real gesture handler (click/touch event), not a non-gesture setTimeout.**
