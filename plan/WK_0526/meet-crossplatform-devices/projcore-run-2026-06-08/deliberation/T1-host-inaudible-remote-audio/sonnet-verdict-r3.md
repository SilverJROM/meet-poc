# sonnet verdict — T1 round 3 (red-team)

## Blockers found in the fix plan

### BLOCKER-1 — Volume and mute-all silently no-op on the per-publisher path

**What breaks:** `setMutedAll(true)` and `setVolume(x)` both operate exclusively on `this.gain.gain.value` (remote-audio.service.ts:L195-205). When the mixer is retired from the audible path, `this.gain` either does not exist or feeds a destination element that is removed from DOM. The per-publisher tile `<audio>` elements have no Web-Audio gain in their chain. The controls-bar calls at controls-bar.component.ts:L109 (`this.remoteAudio.setMutedAll(...)`) and L121 (`this.remoteAudio.setVolume(...)`) produce no audible effect on the tile elements. Remote audio volume becomes uncontrollable; mute-all stops working silently.

**Evidence:**
- `setMutedAll`: remote-audio.service.ts:L195-198 — only sets `this.gain.gain.value`
- `setVolume`: remote-audio.service.ts:L200-205 — only sets `this.gain.gain.value`
- Per-publisher tile elements: tile.component.html:L15 — plain `<audio>` with no Web-Audio chain
- Controls wired to service: controls-bar.component.ts:L109, L121

**How to fix:** In both `setMutedAll` and `setVolume`, add propagation to per-publisher elements:
```typescript
// In setMutedAll after setting gain:
for (const el of document.querySelectorAll<HTMLAudioElement>('audio[data-remote-audio]'))
  el.volume = value ? 0 : this.volume();
// In setVolume after setting gain:
for (const el of document.querySelectorAll<HTMLAudioElement>('audio[data-remote-audio]'))
  if (!this.mutedAll()) el.volume = clamped;
```
The `data-remote-audio` selector covers tile elements. This gives equivalent per-element volume/mute control.

---

### BLOCKER-2 — `remoteAudioBlocked` banner instability: keepalive clears it every 15 s even when elements are paused

**What breaks:** `recoverRemoteAudio` (room.page.ts:L2685-2691) unconditionally sets:
```typescript
this.remoteAudioBlocked.set(!allPlayable && this.remoteAudio.hasSources());
```
`hasSources()` returns `sources.size > 0` (remote-audio.service.ts:L381-383). In the per-publisher path, the mixer sources map is empty (no Web-Audio source nodes) → `hasSources()` is always `false` → `remoteAudioBlocked.set(false)` ALWAYS via this path.

The keepalive fires every 15 s (room.page.ts:L86: `REMOTE_AUDIO_KEEPALIVE_MS = 15_000`) and calls `recoverRemoteAudio`. Tile-emitted `remoteAudioBlocked` events set the banner to `true` (via `handleRemoteAudioBlocked` at L1045), but the 15 s keepalive clears it regardless of whether tile elements are actually playing.

Simultaneously, the reactive banner effect at L650-659:
```typescript
if (!this.remoteAudioMixerEnabled() || !hasSources) return;  // L657 — always exits when mixer disabled
```
When `remoteAudioMixerEnabled() = false`, this effect ALWAYS exits early. It never proactively manages `remoteAudioBlocked` on the per-publisher path. The banner is only driven by tile events + direct imperative sets.

Net result: banner shows from tile event, gets cleared every 15 s by keepalive even if ALL tile elements are still paused. User sees a banner that flickers or vanishes when elements are still blocked.

**Evidence:**
- `recoverRemoteAudio` L2687: `hasSources()` guard clears banner for per-publisher path
- `hasSources()` L381-383: `sources.size > 0` — always 0 with mixer retired
- Reactive effect L657: `!remoteAudioMixerEnabled()` early exit
- Keepalive L2695-2701: 15 s interval → `recoverRemoteAudio`

**How to fix:** Change the banner-set in `recoverRemoteAudio` to distinguish between the two paths:
```typescript
// Old (mixer path only):
this.remoteAudioBlocked.set(!allPlayable && this.remoteAudio.hasSources());

// New (both paths):
const hasAudioToPlay = this.remoteAudio.hasSources() || this.peers().some(p => !p.isLocal && !!p.stream);
this.remoteAudioBlocked.set(!allPlayable && hasAudioToPlay);
```
This makes the banner stable for per-publisher elements: it stays on when elements are paused (because `hasAudioToPlay` is true when remote peers have streams), and clears when elements are playing (`allPlayable = true`).

---

### BLOCKER-3 — Mid-call element recovery absent: keepalive and interaction recovery do not re-play paused tile elements

**What breaks:** `recoverPlayback` at remote-audio.service.ts:L328-329:
```typescript
async recoverPlayback(deviceId?: string): Promise<boolean> {
  if (!this.mixerEnabled()) return this.allSinksPlaying();
```
Early-returns immediately when `mixerEnabled() = false`. It checks `allSinksPlaying()` but does NOT call `audio.play()` on any tile element. The keepalive and `recoverRemoteAudio('interaction')` both reach `recoverPlayback` — and on the per-publisher path, neither attempts to re-play paused tile elements.

Additionally, `recoverVoicePlayout` at L351-352:
```typescript
async recoverVoicePlayout(...): Promise<void> {
  if (!this.mixerEnabled()) return;
```
The voice watchdog's remediation actions (resume, kickstart, replay, rebuild) are all disabled for the per-publisher path. A tile element paused mid-call (iOS page-background, browser auto-suspension) will NEVER be re-played automatically.

This is particularly severe on iOS where the OS can pause audio elements when the page is backgrounded. Without a recovery path, the host foregrounds the app and hears silence with no banner (because BLOCKER-2 also suppresses it).

**Evidence:**
- `recoverPlayback` L328-329: early return, no `play()` on tile elements
- `recoverVoicePlayout` L351-352: early return, watchdog disabled
- `REMOTE_AUDIO_KEEPALIVE_MS = 15_000` (L86): 15 s calls to `recoverRemoteAudio` → `recoverPlayback` → no-op

**How to fix:** In `recoverPlayback`, add per-element play attempt in the `!mixerEnabled` branch:
```typescript
if (!this.mixerEnabled()) {
  const elements = Array.from(document.querySelectorAll<HTMLAudioElement>('audio[data-remote-audio]'));
  await Promise.all(elements.map(el => {
    if (el.paused && el.srcObject) return el.play().catch(() => {});
    return Promise.resolve();
  }));
  return this.allSinksPlaying();
}
```
This gives the 15 s keepalive and interaction-recovery a real re-play path for tile elements.

---

## Regressions the fix would introduce + mitigation

### REGRESSION-1 — Feedback limiter lost (acceptable, document explicitly)

The `FEEDBACK_LIMITER_PARAMS` brick-wall compressor (remote-audio.service.ts:L58, L518-527: threshold=-3 dB, ratio=20:1, knee=0) is part of the mixer graph chain. Per-publisher `<audio>` elements have no equivalent. Same-room feedback (two devices in the same physical room) would produce unmitigated peaks.

For normal remote calls this is harmless — no feedback to suppress. For JROM's demo/testing with devices in the same room, this is a user-experienceable regression.

**Mitigation (non-blocking):** Document the loss. If same-room testing is in scope, add a per-publisher compressor via a thin Web-Audio chain per element (source → compressor → destination → `<audio>`) as a follow-up, or add a UI note. The north-star NS4 ("feedback limiter intact") references the original goal run, not this run — but the spirit holds: document explicitly so it's a known trade-off, not a silent regression.

---

### REGRESSION-2 — B guard "refuse on subscribe" risks voice suppression (must change design)

The consensus fix says "refuse cross-publisher mid overwrite at sfu-client.service.ts:1753." A naive implementation:
```typescript
// At L1753:
if (this.midToEntry.has(rt.mid) && this.midToEntry.get(rt.mid)!.publisherClientId !== publisher.clientId) {
  continue;  // REFUSE — skip overwrite
}
this.midToEntry.set(rt.mid, entry);
```

Risk: CF returns a non-empty mid (in the no-renegotiation branch, L1748-1756) that numerically matches a STALE entry from a previously departed publisher. `midToEntry` still holds the departed publisher's entry (not cleared on departure). The guard fires → skips publisher-B's registration → publisher-B's audio track is never mapped → publisher-B is SILENTLY inaudible. **This directly violates the north-star no-suppress directive.**

Even in the renegotiation path (L1724-1730), if transport recovery reuses a mid number (valid in SDP), a stale entry from a previously-departed publisher in `midToEntry` would block registration.

**Mitigation:** DO NOT implement the guard as "refuse." Instead:
1. In `tearDownPeerSubscription` (or wherever publisher departure is handled), clear all `midToEntry` entries for that publisher's clientId. This removes stale entries at departure time.
2. The no-renegotiation path L1753 then has no stale entry to collide with — allowing the new publisher's registration unconditionally.
3. If logging a collision (future CF behavior audit), LOG but do NOT skip: `if (collision) console.warn(...)` then allow overwrite. The latest subscriber wins; never silently drop a voice.

---

### REGRESSION-3 — `syncPeers` still mixes mixer sources; double-audio if mixer output element stays active

If `remoteAudioMixerEnabled` is changed to `false` (tile audio enabled) but `mixerEnabled()` in the service still returns `true`, the mixer's `addSource` / `bindOutputElement` still runs. If the mixer output element remains in DOM (or its srcObject is set), audio plays through BOTH the tile elements AND the mixer output element → double audio / echo.

The consensus fix step 2 says "Retire the single shared mixer output `<audio>` from the audible path (room.page.html:229-230)." This requires either:
- `@if (remoteAudioMixerEnabled())` at room.page.html:L229 evaluates false → mixer element not rendered → `attachOutputElement(null)` fires → mixer output is silenced, OR
- `mixerEnabled()` returns false → `recoverPlayback` early-returns and doesn't call `output.play()`

If `remoteAudioMixerEnabled = computed(() => false)` and the mixer service's `mixerEnabled()` is changed to `false`, the mixer is disabled and `addSource` / `bindOutputElement` become no-ops (`ensureGraph()` is guarded by callers checking `mixerEnabled()`... actually `ensureGraph()` is NOT guarded this way — `addSource` calls `ensureGraph()` unconditionally). `syncPeers` still calls `addSource` which still builds the Web-Audio graph.

Actually: `syncPeers` calls `addSource` without checking `mixerEnabled()`. If `mixerEnabled() = false` but `addSource` still runs... let me verify. `addSource` doesn't check `mixerEnabled()` — it just calls `ensureGraph()` and adds sources. Sources are built even when mixer disabled.

**Mitigation:** Add `if (!this.mixerEnabled()) return;` at the top of `addSource`. Or change `syncPeers` to gate on `mixerEnabled()`. The consensus fix must be explicit about the mixer-enabled flag change being paired with this guard.

---

## Confirmations (fix points that survive red-team)

1. **`applySpeakerDevice` covers new tile elements on peer-join.** The effect at room.page.ts:L685-699 reads both `selectedAudioOutputId()` AND `this.peers()` — making it reactive to peer additions. The `setTimeout(0)` defers to after Angular renders the new tile, ensuring `querySelectorAll('video, audio')` finds the new element. `setSinkId(selectedDevice)` is applied after the tile's own `play()`, but Chrome handles mid-play sinkId changes gracefully. A4 is correctly dissolved for the tile path. ✓

2. **Autoplay blocked on tile elements → banner → gesture recovery path is complete.** Tile's `audio.play()` rejection → `remoteAudioBlocked.emit()` → `handleRemoteAudioBlocked()` → banner shows. User taps → `enableRemoteAudio()` → `unlockAudioFromGesture(true)` → `unlockAndPlayRemoteSinks(selectedDevice)` → `audio[data-remote-audio]` loop at L282-292 → `setSinkId(selectedDevice)` + `play()`. The tile element has `data-remote-audio` attribute (tile.component.html:L15) so it is covered by this loop. ✓ (Contingent on BLOCKER-2 fix keeping the banner stable long enough for the user to see it.)

3. **R2 concurrent publishers honored.** Per-publisher tile elements are independent — one per remote peer, all unmuted, none gated by active-speaker state. `ActiveSpeakerService` confirmed UI-only (north-star.md:L33-34). North-star no-suppress directive is honored at the per-element level. ✓

4. **`evaluateRemoteAudioPlayability` is forward-compatible.** remote-audio-playability.ts:L40-50: when `!mixerEnabled`, returns `perPeerAllUnpaused` regardless of AudioContext state. The function correctly drives `unlockAudioFromGesture`'s return value for the per-publisher path. ✓

5. **R3 diagnostics will work and disambiguate A3 vs A4.** `media-playout` stat type is the correct Chrome 113+ source for `audioLevel`/`totalAudioEnergy` (current collector reads only `inbound-rtp.audioLevel` → null since Chrome v113). The `media-playout` capture is independent of mixer vs per-publisher architecture. If deployed to the CURRENT (pre-fix) build, one future call will show: emitted climbing + `audioLevel > 0` → A4 (routing to wrong device); emitted climbing + `audioLevel = 0` → A3/AudioContext issue. ✓ (Note: R3 should be deployed before the architectural fix lands to capture a diagnostic call on the CURRENT code path.)

6. **`selectedAudioOutputId` signal is correctly cleared on sinkId failure (C4).** room.page.ts:L691-694: the `applySpeakerDevice` result check clears both the signal and localStorage when `setSinkId` fails. The per-publisher path uses the same `applySpeakerDevice` → same failure-clear logic. C4 is fixed as part of the architectural change. ✓

---

## New issue / 7th mechanism

**NONE on the root-cause list.** No new silent-failure mechanism was found beyond the R1-R2 synthesis table (A1-A6). The per-publisher path has no structural 7th mechanism.

However: **the three BLOCKERS above are bugs IN THE FIX ITSELF** (volume/mute regression, banner instability, no mid-call recovery) that would make the fixed app exhibit new user-visible failures not present in the original code. These are not root causes of the original bug — they are implementation holes in the proposed fix that must be plugged before ship.

---

STATUS: AGREE — fix plan direction is correct and dissolves A1/A3/A4/A5 in one structural move; but three implementation holes MUST be plugged before ship: (1) wire volume/mute-all to per-publisher element `.volume` property in `setMutedAll`/`setVolume`; (2) fix `remoteAudioBlocked` banner stability by replacing `hasSources()` guard in `recoverRemoteAudio:L2687` with a per-publisher-aware "has remote peers with streams" check; (3) add per-publisher `audio.play()` attempts to `recoverPlayback`'s `!mixerEnabled` early-return so keepalive and interaction recovery re-play paused tile elements; PLUS change the B guard design from "refuse overwrite" to "clear stale entries on publisher departure" to avoid north-star no-suppress violation.
