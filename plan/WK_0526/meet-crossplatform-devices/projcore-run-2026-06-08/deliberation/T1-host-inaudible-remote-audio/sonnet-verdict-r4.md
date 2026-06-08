# sonnet verdict — T1 round 4

## Q1 — Architecture: Option A confirmed

**Option A (direct per-publisher `<audio srcObject=stream>`, no AudioContext in audible path) is the correct call. Proof that it closes both A3 and A4 regardless of which was the actual trigger:**

| Mechanism | Option A closure |
|-----------|-----------------|
| A3 (orphaned graph) | No AudioContext in audible path → no graph to orphan → structurally impossible. `ensureGraph()` is only called inside `if (this.mixerEnabled())` guards (unlockAndPlayRemoteSinks:L264, syncPeers:L238-241). With `mixerEnabled() = false`, no context is ever created. |
| A4 (sinkId on destination stream) | No destination stream → each element's `srcObject` = a direct WebRTC MediaStream. `setSinkId` on `<audio srcObject=directTrack>` is the Meet-proven path. The fragile "sinkId-before-srcObject" ordering bug (L279 vs L297) disappears because there IS no destination stream at all. |
| A1 (gesture guard) | Per-element play() in tile effect (synchronous on mount) replaces the single guarded `output.play()`. |
| A5 (SPOF) | Per-element — one failing can't silence others. |

**Existing guards prove no phantom AudioContext:** `syncPeers` at remote-audio.service.ts:L238-241 already has `if (!this.mixerEnabled()) { this.clearSources(); return; }`. `unlockAndPlayRemoteSinks:L264` and `recoverPlayback:L328-329` already have `if (this.mixerEnabled())` guards. Option A does NOT create any AudioContext as long as `mixerEnabled() = false`.

**AudioContext consumers in room.page.ts — none are breaking:**
- Banner effect L657: `if (!this.remoteAudioMixerEnabled() || !hasSources) return` → always exits early → needs B8 fix regardless (already known).
- Keepalive effect L674: `contextState !== 'running'` → `installRemoteAudioInteractionRecovery` always installed → every click/touch calls `recoverRemoteAudio('interaction')` → with B7 fix, re-plays any paused tile elements → BENEFICIAL for iOS recovery.
- L2688: same always-install behavior → harmless.
- `testSpeaker` L1053-1067 and join sound L2143-2163: each creates its own independent local AudioContext that routes to `context.destination` (DEFAULT output). Pre-existing; NOT fixed by Option A. `testSpeaker` always played to system default — this is unchanged.

**Why not Option B (per-element GainNode→destination→`<audio>`):** B routes audio through a `MediaStreamAudioDestinationNode.stream` → `setSinkId` on that stream is precisely A4's fragility. Option B re-introduces the broken path. Option A avoids it entirely.

**Option A confirmed.**

---

## Q2 — B1-B10 verification table

| # | Verdict | Evidence + concrete correction required |
|---|---------|----------------------------------------|
| **B1** | **FIX-NEEDED** | `setMutedAll`/`setVolume` propagation to `el.volume` is correct, BUT the revised consensus says "tile audio effect reads volume()/mutedAll() reactively." TileComponent (tile.component.ts:L17-68) currently has NO injection of RemoteAudioService and no reactive read of volume/mutedAll. The implementer must CHOOSE: (a) inject RemoteAudioService into TileComponent and add `this.remoteAudio.volume()/mutedAll()` reads to the existing audio effect (L56-67), OR (b) use querySelectorAll in `setMutedAll`/`setVolume` in the service. Approach (b) is simpler (no new tile dependency). Approach (a) is needed ANYWAY for B9 (selectedAudioOutputId read). Since B9 already requires injecting the service into the tile, do both (a): read volume + mutedAll + selectedAudioOutputId in a single reactive tile effect. **New elements mounting get correct initial volume; service setters propagate imperatively to existing elements.** |
| **B2** | OK | Accepted loss, document in changes.md. No code fix required. |
| **B3** | **FIX-NEEDED (concrete risk)** | `MAX_VOLUME = 1.3` at remote-audio.service.ts:L49. Setting `el.volume > 1.0` throws a TypeError (browser spec: volume must be in [0.0, 1.0]). On init, `readStoredVolume()` may return 1.1–1.3 from prior sessions → `setVolume(1.3)` → `clamped = Math.min(1.3, 1.3) = 1.3` → `el.volume = 1.3` → **DOMException thrown in the setter loop**. Fix requires BOTH: (1) change `MAX_VOLUME` from 1.3 to 1.0 in remote-audio.service.ts:L49; (2) when setting `el.volume`, use `Math.min(1.0, value)` as a safety clamp even after (1). The controls-bar UI cap to 100% alone is insufficient — stale stored values > 1.0 survive across sessions. |
| **B4** | **FIX-NEEDED (concrete location)** | Double-audio confirmed: `orderedStripPeers = computed(() => this.peers())` (room.page.ts:L444) returns ALL peers. In share layout, the presenter appears in BOTH share-main (room.page.html:L249, `remoteAudioEnabled` enabled) AND strip (L273, `remoteAudioEnabled` also enabled). The fix is at room.page.html:L273 — change the strip tile's binding to: `[remoteAudioEnabled]="!remoteAudioMixerEnabled() && peer.id !== sharingPeer()?.id"`. When strip is collapsed (`@if (!shareStripCollapsed())` at L270 is false), strip tiles are not rendered — no double audio when collapsed, but the fix is still needed for when strip is visible. Local-share case: `sharingPeer()` returns the local peer (L425-427), but local tiles never play audio (`peer.isLocal → stream = null` in tile effect:L58) — no double audio for local share. The fix only has teeth for REMOTE sharers. |
| **B5** | OK | `tearDownPeerSubscription` (sfu-client.service.ts:L974-1014) already deletes `midToEntry` entries at L984 when a publisher departs. By the time publisher-B subscribes, departed publisher-A's mids are already cleared. The no-renegotiation else branch (L1747-1756) skips all entries anyway (`if (!rt.mid) continue` — CF returns `mid:""` for all remote subscriptions). For the renegotiation path, `existingMids` pre-filter (L1721-1722) already prevents reconciling B's tracks into A's mids. The B5 guard at L1753 is therefore a future-proofing defense. Safe implementation: check if existing entry's publisher is still live in `remotePublishers()` before skipping; if departed, allow overwrite. Never strand publisher-B (log collision + overwrite is safer than skipping). |
| **B6** | **FIX-NEEDED (targeting incomplete)** | The revised consensus says "re-play + re-setSinkId the [data-remote-audio] element for the stalled publisher." No mechanism exists to identify WHICH `[data-remote-audio]` element belongs to `peerId`. Currently tile audio elements have `class="remote-audio-sink" data-remote-audio` (tile.component.html:L15) but NO `data-peer-id` attribute. Two valid approaches: (a) add `[attr.data-peer-id]="peer().id"` to the tile audio element → `recoverVoicePlayout` does `querySelector(`audio[data-remote-audio][data-peer-id="${peerId}"]`)` to target specifically; (b) simpler: re-play ALL paused `[data-remote-audio]` elements regardless of peerId — if any element is paused, re-play it. Approach (b) is less surgical but correct and doesn't require template changes. Either approach must be chosen explicitly in the implementer brief. |
| **B7** | OK | `recoverPlayback` at remote-audio.service.ts:L328-329 early-returns for `!mixerEnabled`. Adding per-element `play()` attempts in this branch is correct. With `contextState = 'none'` always triggering `installRemoteAudioInteractionRecovery`, the keepalive (15s) + every user interaction will re-play paused elements. This also covers iOS page-background recovery. |
| **B8** | **FIX-NEEDED (anchor wrong)** | The proposed fix "base `remoteAudioBlocked` on per-element paused state" at `recoverRemoteAudio:L2687` is correct in direction. Concrete implementation: `const hasAudioToPlay = this.remoteAudio.hasSources() || this.peers().some(p => !p.isLocal && !!p.stream);` then `remoteAudioBlocked.set(!allPlayable && hasAudioToPlay)`. BUT: `allPlayable` from `recoverPlayback(!mixerEnabled)` calls `allSinksPlaying()` which queries `audio[data-remote-audio]` elements. When any element has `srcObject = null` (peer present, stream not yet arrived — see Issue 11), `audio.paused = true` → `allSinksPlaying() = false` → banner fires spuriously. This is also the 11th issue fix anchor — `allSinksPlaying()` must filter to `elements.filter(el => !!el.srcObject)` before computing paused state. Without this filter, B8 produces false-positive banners on every peer join. |
| **B9** | **CRITICAL — required for layout transitions, not just first-frames** | The `applySpeakerDevice` effect at room.page.ts:L685-699 reads `this.peers()` AND `this.selectedAudioOutputId()`. When a remote peer **starts screen-share**: `shareLayoutActive()` changes → Angular destroys grid tile → creates new share-main tile. `peers()` does NOT change (the sharing peer is already in peers, only their `screenOn` state changed). `selectedAudioOutputId()` does NOT change. **The `applySpeakerDevice` effect DOES NOT FIRE on share-start.** The new share-main tile's audio element plays on DEFAULT device with no automatic correction. Without B9, audio routes to the DEFAULT device after every grid↔share layout transition (each creates new component instances with blank elements). Fix: inject `RemoteAudioService` into `TileComponent`; in the audio effect (L56-67), read `selectedAudioOutputId()` reactively and call `this.applySinkId(audio, this.remoteAudio.selectedAudioOutputId())` BEFORE `audio.play()`. The `applySinkId` method must be exposed or the tile must call `setSinkId` directly. |
| **B10** | OK | `syncPeers` already has the guard (L238-241). `unlockAndPlayRemoteSinks` and `recoverPlayback` are already guarded. Slimmed service is preserved. |

---

## Q3 — End-to-end trace: first breaking step

Trace through each step with the revised design (B1-B10 applied, B9 correctly implemented):

**1. Join (host gesture):** `unlockAudioFromGesture(false)` → `unlockAndPlayRemoteSinks(selectedDevice)` → `if (mixerEnabled())` is false → skip graph block → `audio[data-remote-audio]` loop queries elements → NO tile elements yet (no peers) → vacuously `perPeerAllUnpaused = true` → `remoteAudioBlocked.set(false)`. ✓

**2. Host publishes:** Unrelated to remote audio playout. ✓

**3. Publisher A (Windows) subscribes → stream arrives → `peers()` updates:**
- New tile renders: `<audio data-remote-audio autoplay>` in DOM
- Tile effect fires (synchronous): with B9, `applySinkId(audio, selectedDevice)` before `audio.play()` → plays on SELECTED device ✓
- `syncPeers` effect → `setTimeout(0)` → `unlockAndPlayRemoteSinks(selectedDevice)` → loop finds tile element → redundant sinkId + `play()` (harmless) ✓
- Host hears A on selected device. ✓

**4. Publisher B (phone) joins, BOTH concurrent:**
- Same path as step 3. B's tile gets its own element.
- A's element continues playing unaffected.
- Both concurrent, both on selected device, no suppression. ✓ (North-star honored)

**5. Host picks a different output device mid-call:**
- `selectedAudioOutputId` signal updates → `applySpeakerDevice` effect at L685 fires (reads `selectedAudioOutputId()`) → `setTimeout(0)` → `applySpeakerDevice(newDevice)` → `querySelectorAll('video, audio')` finds both tile elements → `setSinkId(newDevice)` applied → Chrome reroutes mid-play → both on new device. ✓

**6. Host volume slider (B1 + B3 fixes applied):**
- `setVolume(0.6)` → `MAX_VOLUME = 1.0` clamps → `el.volume = 0.6` on all `[data-remote-audio]` elements (service querySelectorAll) AND tile effect reactively sets `audio.volume = 0.6` (tile reads volume() signal via B9 injection) ✓
- Both publishers at 60% volume. ✓

**7. Host mute-all then unmute:**
- `setMutedAll(true)` → `el.volume = 0` on all elements → silence ✓
- `setMutedAll(false)` → `el.volume = 0.6` (stored volume) → audio resumes ✓

**8. A starts screen-share (B4 echo test):**
- `remoteScreenStreams()` updated → `sharingPeer()` = A → `shareLayoutActive() = true`
- Angular destroys A's grid tile, creates share-main tile for A + strip tiles for ALL peers
- **Share-main tile for A:** `remoteAudioEnabled = true` → audio element created → B9: `applySinkId(audio, selectedDevice)` + `play()` → A's voice on SELECTED device ✓
- **Strip tile for A:** B4 fix: `[remoteAudioEnabled]="!remoteAudioMixerEnabled() && peer.id !== sharingPeer()?.id"` = `true && (A.id !== A.id)` = `false` → NO audio element for A in strip → no echo ✓
- **Strip tile for B:** `remoteAudioEnabled = true && B.id !== A.id` = true → B's audio element in strip plays on selected device ✓
- `peers()` DID NOT CHANGE on share-start → `syncPeers` setTimeout DID NOT fire → BUT B9 in-tile sinkId already handled the new share-main tile ✓

**WITHOUT B9:** Step 8 is the first truly breaking step. Share-main tile plays on DEFAULT device permanently. `applySpeakerDevice` effect does not fire (peers() unchanged, selectedAudioOutputId() unchanged). No automatic correction. **B9 is therefore not optional — it is required for correct audio after any layout transition.**

**9. A stops share:** Layout back to grid → A's grid tile created → B9 applies sinkId → both playing on selected device ✓

**10. B leaves then rejoins:**
- B leaves: `removePeer` → `tearDownPeerSubscription` → `remoteStreams.delete(B)` → `peers()` updates → B's tile destroyed → audio element removed ✓
- B rejoins: new session, new subscription → stream arrives → `peers()` updates → new tile → B9 applies sinkId → selected device ✓

**11. Host backgrounds tab then resumes:**
- Browser may pause tile elements (especially iOS)
- `visibilitychange` fires → `recoverRemoteAudio('visibility')` → `recoverPlayback(selectedDevice)` → B7 fix: iterates `[data-remote-audio]` elements → `play()` attempts ✓
- On iOS if `play()` rejected: `allSinksPlaying() = false` (element paused) → B8 fix: `hasAudioToPlay = true` (remote peers have streams) → `remoteAudioBlocked.set(true)` → banner ✓
- `contextState = 'none'` always → `installRemoteAudioInteractionRecovery` always installed → next user tap → `recoverRemoteAudio('interaction')` → `recoverPlayback` → `play()` attempts → elements resume ✓

**12. Second remote starts/stops talking:** Element already playing (or restarted per step 11). Audio flows when talking, silence when not. Element stays playing through pauses. ✓

**First breaking step without full B-fixes:** Step 8 (A starts screen-share) — new share-main tile element plays on DEFAULT device when B9 is not implemented. With all B-fixes correctly applied: **no break found across all 12 steps.**

---

## New issue (11th) found

### Issue 11 — NULL-srcObject per-publisher elements cause spurious `remoteAudioBlocked` banners on every peer join

**Root:** `peers()` computed (room.page.ts:L304-351) includes a remote peer as soon as they appear in `peerIdentities` (WebSocket presence event, L326-349). At that point, `sfuClient.remoteStreams().get(clientId)` = null because the SFU subscription hasn't completed. The peer's PeerState has `stream = null`.

When `!remoteAudioMixerEnabled() = true` (Option A enabled), the tile template condition `@if (!peer().isLocal && remoteAudioEnabled())` renders an `<audio data-remote-audio>` element for the null-stream peer. The tile effect (tile.component.ts:L58) sets `audio.srcObject = null` and early-returns (no `play()`). The element has `srcObject = null` and is in a paused state (`audio.paused = true`).

`allSinksPlaying()` (remote-audio.service.ts:L385-396) queries ALL `audio[data-remote-audio]` elements and checks `elements.every(audio => !audio.paused)`. The null-stream element is paused → `perPeerAllUnpaused = false` → `evaluateRemoteAudioPlayability(!mixerEnabled, ...) = false` → `allSinksPlaying() = false`.

With B8 fix: `hasAudioToPlay = peers().some(p => !p.isLocal && !!p.stream)`. If ANY existing peer has a stream (peer-A is playing), `hasAudioToPlay = true`. Then `remoteAudioBlocked.set(!false && true) = true` → **banner fires** the moment peer-B appears in the room, even before their audio stream arrives.

The banner clears once peer-B's stream arrives and their element starts playing (tile effect re-runs with non-null stream → `play()` → element unpaused). The banner window = time from peer-B appearing in `peerIdentities` to first `processOntrack` event for B (typically 1-5 seconds of subscription setup). During this window, the host sees a false "audio blocked" indicator.

**In a busy room** (multiple peers joining quickly), this would flash the banner repeatedly. The banner should only indicate a REAL playout failure, not a subscription-in-progress state.

**Fix:** In `allSinksPlaying()` (remote-audio.service.ts:L385-396) and the `perPeerAllUnpaused` computation in `unlockAndPlayRemoteSinks` (remote-audio.service.ts:L310):

```typescript
// Before (counts null-source elements):
const perPeerAllUnpaused = elements.every((audio) => !audio.paused);

// After (only counts elements with an actual source):
const activeElements = elements.filter(el => !!el.srcObject);
const perPeerAllUnpaused = activeElements.length === 0 || activeElements.every(audio => !audio.paused);
```

Apply in both places: `allSinksPlaying()` at L387, and the inline computation in `unlockAndPlayRemoteSinks` at L310. This excludes subscription-pending (null-srcObject) elements from the playability check without affecting elements that have a source but are paused (those are real failures).

**This issue is NOT in B1-B10.** It only emerges from the combination of Option A (per-publisher elements for all remote peers) + `peers()` including subscription-pending peers (stream=null) + `allSinksPlaying()` treating null-source elements as "paused/broken."

---

STATUS: AGREE — Option A confirmed (closes A3+A4 regardless of trigger; existing `mixerEnabled()` guards already prevent phantom AudioContext); B3 needs MAX_VOLUME changed to 1.0 and `el.volume` clamp; B4 concrete fix is `[remoteAudioEnabled]="!remoteAudioMixerEnabled() && peer.id !== sharingPeer()?.id"` at room.page.html:L273; B6 needs explicit per-element targeting strategy (data-peer-id attribute OR all-paused approach); B9 is critical for layout transitions not just first-frames (without it, every share-start permanently routes audio to DEFAULT device); B8's `allSinksPlaying()` must filter null-srcObject elements; one new Issue 11 (null-stream elements cause spurious banners on peer join) — fix: filter `el.srcObject !== null` in both `allSinksPlaying()` and `unlockAndPlayRemoteSinks` perPeerAllUnpaused computations.
