# sonnet verdict — T1 round 1

## Root-cause finding(s)

| # | claim | confidence | evidence file:line | which anomaly |
|---|-------|------------|--------------------|---------------|
| 1 | `output.play()` is never called from a user gesture when `sources.size > 0`. At `join()` gesture time, `sources.size === 0` → the `if (this.mixerEnabled() && this.sources.size > 0)` guard at L294 skips `bindOutputElement()` + `output.play()`. When sources are added later (non-gesturally), `recoverPlayback()` calls `output.play()` outside any gesture. On iOS Safari and strict-autoplay browsers this is rejected; on desktop Chrome it depends on the per-origin autoplay grant. | **proven** | remote-audio.service.ts:L294-304 (guard); addSource:L474 (`void this.recoverPlayback().catch()`); room.page.ts:L853,861 (join gesture → L2667 → unlockAndPlayRemoteSinks) | A |
| 2 | If the AudioContext is re-suspended after the `join()` gesture (browser auto-suspension after inactivity, iOS OS page-backgrounding, Chrome tab inactivity), every subsequent `context.resume()` call is non-gestural and is rejected. The `syncPeers` effect explicitly fires `unlockAudioFromGesture` via `setTimeout(0)` — the code comment at L269-271 acknowledges this rejection path. The voice watchdog `resume` action calls `resumeContext()` (L357-364) non-gesturally — also rejected. Recovery requires the user to click the banner or produce another input event. | **proven** | remote-audio.service.ts:L263-278 (resume path + comment); room.page.ts:L636-639 (setTimeout(0) sync-peers effect); L2712-2716 (watchdog → L2796 → recoverVoicePlayout → resumeContext L357) | A |
| 3 | The "one publisher at a time" pattern is most likely sequential sessions (Peer2 Windows PC went offline around 00:26:45; Phone Peer2 joined afterward), NOT concurrent displacement. The 00:26:52 gap (~7 s) is consistent with the teardown notification lag. No code path in the normal presence/subscribe flow removes publisher-A's `midToEntry` entries when publisher-B subscribes. | **hypothesis** | sfu-client.service.ts:L804-829 (processOntrack — additive, never removes); L1719-1729 (reconcile only touches newTransceiverMids, not existing); diagnostics-evidence-2026-06-08.md (gap timeline) | B |

## Contributing bugs / races / alternative causes

**C1 — `ensureGraph()` silently breaks the audio graph on unexpected context close** (remote-audio.service.ts:L508-535): If the AudioContext reaches `'closed'` state outside `reset()` (iOS OS kill, CF AudioWorklet crash), `ensureGraph()` creates a new context but `this.gain`, `this.limiter`, `this.destination` still reference nodes from the CLOSED context (they are not nulled). Subsequent `addSource` calls do `source.connect(this.gain!)` — connecting a new-context node to an old-context node throws `InvalidStateError`. The `try/catch` in `addSource` (L475) swallows it silently. No source enters the mixer; `sources.size` remains 0; banner shows `hasSources=false`; no banner is shown; audio is inaudible with no visible indicator.
- Evidence: ensureGraph:L507-535 (no `this.gain = null` after context rebuild); addSource:L466-478 (try/catch around connect); reset():L444-462 (the ONLY path that properly nulls nodes)

**C2 — Voice watchdog emitted-delta blind spot for suspended-context scenario** (room.page.ts:3901-3905, decideVoiceRecovery:L66-77): `jitterBufferEmittedCount` is a decode-layer counter tracked by the browser's RTP stack. Chrome's jitter buffer may continue emitting samples (incrementing the counter) to an internal buffer even when the AudioContext is `suspended`, since RTP decode runs in a separate thread from the Web Audio scheduler. If `emittedDelta > VOICE_RECOVERY_MAX_EMITTED_DELTA (= 0)`, `decideVoiceRecovery` returns `'none'` — no watchdog action. The context stays suspended; audio is inaudible; the watchdog concludes everything is fine. **This is uncertain** (depends on Chrome internals) but it would explain why the watchdog failed to fire despite sustained inaudibility.
- Evidence: remote-audio.service.ts:VOICE_RECOVERY_MAX_EMITTED_DELTA=0 (L53); decideVoiceRecovery:L72 (`if (emittedDelta > 0) return 'none'`); room.page.ts:L3901-3905 (`remoteVoiceSample` uses `jitterBufferEmittedCount`)

**C3 — Ended-track phantom source from CF subscription termination** (remote-audio.service.ts:L660-663): When CF terminates a subscription mid-call (track.readyState → `'ended'`), `currentAudioTrack` returns `tracks[0]` (the ended track) because no live track exists. `syncPeers` sees `current.track !== peer.track` (different track reference after ended) and calls `addSource` with the ended track. `track.addEventListener('ended', onEnded, {once:true})` won't re-fire for an already-ended track, so this phantom silent source stays in `this.sources` indefinitely, contributing nothing but not causing the primary inaudibility.
- Evidence: remote-audio.service.ts:L660-663 (`tracks[0]` fallback); syncPeers:L255 (track identity check); addSource:L471 (ended listener `once:true`)

**C4 — `selectedAudioOutputId` signal not cleared on sinkId failure** (remote-audio.service.ts:L85-112, L652-657): When `setSinkId(deviceId)` fails, `onSelectedSinkFailure` calls `clearStoredAudioOutputDeviceId()` (clears localStorage) but the in-memory `selectedAudioOutputId` signal is NOT reset. The bad deviceId is passed again on every subsequent `unlockAudioFromGesture` call, causing repeated `setSinkId` failures + fallback-to-default cycles. Audio should still reach the default device, but a slow sinkId fallback chain could temporarily stall `output.play()` startup.
- Evidence: applyMediaElementSinkWithDefaultFallback:L85-112; applySinkId:L652-657 (`onSelectedSinkFailure: clearStoredAudioOutputDeviceId`); room.page.ts:L2667 (`selectedAudioOutputId() || undefined`)

**C5 — `audioLevel` null for host inbound tracks in Chrome 113+** (sfu-client.service.ts:L749): Chrome moved inbound-rtp `audioLevel` and `totalAudioEnergy` to `media-playout` stat type. The collection reads `stat.audioLevel` from `inbound-rtp` stats — `undefined` → `null` via `numberOrNull`. `totalAudioEnergy` is not collected at all from inbound tracks. This makes it impossible to distinguish "suspended AudioContext + samples decoded" from "decoded and silently sunk."
- Evidence: sfu-client.service.ts:L749 (audioLevel only); SfuInboundTrackStats:meeting-sessions.service.ts:L289 (no totalAudioEnergy); evidence snapshot: `audioLevel=None totEnergy=None`

## Fix approach (mechanism-level, file:line — what to change and why)

**FIX-1 (closes RC-1 + directly unblocks iOS):** In `unlockAndPlayRemoteSinks`, remove the `sources.size > 0` guard for the `output.play()` call (remote-audio.service.ts:L294). Instead, always call `bindOutputElement()` + `output.play()` when `mixerEnabled && outputElement`, regardless of sources. Rationale: calling `play()` on the output element (playing silence) during the join gesture pre-warms it. When sources are added later, audio flows without needing another gesture. The element plays the (currently empty) `destination.stream` silently — no audible consequence when no sources are present.

**FIX-2 (closes C1 — null nodes on context rebuild):** In `ensureGraph()`, after creating a new AudioContext (L508-511), add `this.gain = null; this.limiter = null; this.destination = null;` so that the subsequent `if (!this.gain)` / `if (!this.limiter)` / `if (!this.destination)` blocks create fresh nodes on the new context instead of reusing orphaned nodes from the closed context.
- Change at: remote-audio.service.ts:L508-512

**FIX-3 (closes RC-2 — give keepalive oscillator non-zero gain):** Change `this.keepaliveGain.gain.value = 0` (remote-audio.service.ts:L624) to a non-zero but inaudible value (e.g., `0.00001`). A zero-amplitude signal may still be detected as "silence" by Chrome's auto-suspension heuristic; a very small non-zero signal prevents Chrome from categorizing the context as inactive. Verify Chrome doesn't auto-suspend with the current 20Hz@gain=0 setup first (empirical test); if it does, bump to 0.00001.

**FIX-4 (closes C4 — clear in-memory sinkId on failure):** When `onSelectedSinkFailure` fires (remote-audio.service.ts:L653-656), also reset the `selectedAudioOutputId` signal in room.page.ts (currently only localStorage is cleared). This requires the service to notify the page component — the existing `onSelectedSinkFailure` callback in `applySinkId` is the hook; extend it to emit an event or call a callback that the room page wires to `selectedAudioOutputId.set('')`.

## R3 diagnostics to add (exact fields + where captured)

**D1 — `totalAudioEnergy` per inbound audio track (sfu-client.service.ts:L729-754):**
Add `totalAudioEnergy: numberOrNull(stat.totalAudioEnergy)` to the inbound-rtp push block (L736 area). Update `SfuInboundTrackStats` type (meeting-sessions.service.ts:L276) to add `totalAudioEnergy?: number | null`. If Chrome has it on inbound-rtp (pre-v113), this proves samples were decoded. If null (Chrome 113+), use D2 below.

**D2 — `media-playout` stat capture — HOST-SIDE playout proof (sfu-client.service.ts after inbound loop ~L754):**
After the `inbound-rtp` loop, add:
```
for (const stat of stats.values()) {
  if (stat.type !== 'media-playout') continue;
  // stat.audioLevel, stat.totalAudioEnergy, stat.totalSamplesDuration
  // Capture as aggregate — one entry per kind, not per-publisher
}
```
Add `playoutStats?: { audioLevel: number | null; totalAudioEnergy: number | null; totalSamplesDuration: number | null }` to `SfuDiagnosticsSnapshot`. **Interpretation key**: `jitterBufferEmittedCount` climbing AND `media-playout.audioLevel > 0` → audio IS reaching the OS output device → sinkId issue. `jitterBufferEmittedCount` climbing AND `media-playout.audioLevel === 0` → decoded but not reaching speaker → AudioContext suspended or mixer gain=0. `jitterBufferEmittedCount` flat + `bytesReceived` climbing → AudioContext suspended AND jitter buffer holding samples.

**D3 — `remoteAudioContextState` in the emitted diagnostics payload (diagnostics-capture path):**
Currently `contextState` is a live signal but not emitted in the `DiagnosticsPayload` (meeting-sessions.service.ts:L345+). Add `remoteAudioContextState: string | null` to `DiagnosticsPayload` so server-side samples show whether the host's context was `'running'` or `'suspended'` at each poll time. Capture at the collection site (wherever `sfuDiagnostics` is assembled).

**D4 — `jitterBufferEmittedCount` delta displayed per inbound track (diagnostics.page.ts):**
`jitterBufferEmittedCount` is collected (sfu-client.service.ts:L746) but not displayed in the diagnostics page. Display it (or a computed `avgJBDelayMs = jitterBufferDelay / jitterBufferEmittedCount * 1000`) alongside `bytesReceived` for each inbound audio row. This makes the decode/emitted state visible without needing to diff samples manually.

## Holes you could NOT rule out

1. **`jitterBufferEmittedCount` vs suspended AudioContext**: Chrome-internal — whether the RTP jitter buffer's emit counter increments when the WebAudio context is suspended is not confirmed from code alone. If it DOES still increment, the voice watchdog's `emittedDelta > 0` exit condition fires → watchdog returns 'none' → never attempts resume → audio stays inaudible with no watchdog action. If it STOPS, the watchdog fires 'resume' (which then fails non-gesturally, but at least triggers the banner). This is the critical uncertainty for R3. D2 (`media-playout`) is the direct probe.

2. **sinkId pointing to silent hardware output**: If `selectedAudioOutputId` holds a valid deviceId for a device that exists (e.g., HDMI display with no speaker attached), `setSinkId()` succeeds, the element plays to that device, `allSinksPlaying()` returns true, no banner shown, but the host hears nothing from the laptop speakers. Not a code bug — a device-selection bug. D2's `media-playout.audioLevel` would be >0 (OS is playing to the selected device), and `setSinkId` success vs. heard-audio discrepancy would confirm it.

3. **Anomaly B concurrent presence**: If Peer2 (PC) and Phone Peer2 were genuinely concurrent and only one showed in diagnostics, the remaining unexplained mechanism is either (a) a transport recovery between the two subscriptions that cleared `midToEntry`, leaving only the re-subscribed publisher, or (b) CF's SDP returning a reused mid for the second subscription, which caused `reconcileSubscribedMids` to throw and the second subscribe to never populate `midToEntry`. Both require the console log from that session to confirm.

4. **`mutedAll` false trigger**: No code path was found that could spuriously set `mutedAll=true` (it's user-driven via `setMutedAll`). Ruled out unless a UI bug or double-event produced it — low probability.

---

STATUS: AGREE — the root cause is a two-part failure: (1) `output.play()` is never called from a user gesture when sources exist (join gesture fires with `sources.size=0`, skipping the play call), so the output element is never pre-warmed; and (2) any subsequent `context.resume()` attempt (from `syncPeers` effect setTimeout, voice watchdog, or keepalive) is rejected by the browser as non-gestural, leaving the AudioContext suspended and producing silence; fix is to remove the `sources.size > 0` guard in `unlockAndPlayRemoteSinks` so `output.play()` is always called from the join gesture, AND null out `gain/limiter/destination` in `ensureGraph()` on context rebuild.
