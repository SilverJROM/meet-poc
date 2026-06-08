# sonnet verdict — T1 round 6

## Q1 — B13-B16 each: correct & sufficient?

### B13 — No autoplay attribute: CORRECT AND SUFFICIENT (with one impl note)

**Is the race real?** Yes. `audio.autoplay = true` on Chrome: when `srcObject` is assigned to an autoplay element that is in the DOM AND the page has user activation, the browser starts playback immediately — BEFORE any explicit `play()` call. Since `setSinkId` is async, any frames played before `setSinkId` resolves go to the DEFAULT device (A4 re-introduced). B13's fix — remove the `autoplay` attribute entirely — is the correct and complete answer. Without `autoplay`, `srcObject` assignment only starts loading/buffering, not playback; `paused = true` until explicit `play()`. ✓

**Does `srcObject` assignment itself trigger playback on some browsers?** Only when `autoplay` is present or `autoplay` policy is overridden by the browser (e.g., via `document.policy.allowsFeature('autoplay')`). For a plain `<audio>` without `autoplay`, `srcObject = stream` never starts playback on any major browser. B13 is fully sufficient. ✓

**Implementation note on `playsinline`:** keep it — required on iOS for in-page audio vs full-screen. The existing `createKickstartElement` at remote-audio.service.ts:L557 uses `audio.setAttribute('playsinline', '')`. Same pattern applies to registry elements. Note that the existing `createKickstartElement` at L555 sets `audio.autoplay = true` (kickstart elements are muted autoplay elements for context warming — intentional). The registry `addPublisher` must NOT copy this line. Explicitly: `audio.autoplay = false` or simply never set it.

---

### B14 — `reset()` clearRegistry: CORRECT AND SUFFICIENT (with one implementation guard)

The ordering requirement "BEFORE `clearSources()`" — verified as functionally safe but not semantically required (registry DOM elements and mixer AudioContext nodes are independent; no dependency between them). "BEFORE" is a convention. ✓

**The in-flight `addPublisher` race** (not just cleanup order): if `addPublisher(A, stream)` is awaiting `this.applySinkId(...)` when `reset()`/`cleanupCall()` fires:
1. `peerIdentities.set(new Map())` at room.page.ts:L2465 causes `peers()` → `syncPeers` → `removePublisher(A)` → BUT A is not yet in registry (added at step 9) → `removePublisher` is a no-op.
2. `remoteAudio.reset()` at L2507 → `clearRegistry()` → registry empty → nothing found for A.
3. `addPublisher(A)` resumes from the awaited `setSinkId` → `el.play()` → `registry.set(A, {stream, el})` — AFTER reset. Element is live in body, in registry, but next call setup has already started.

This is a real (low-probability) leak. **Mitigation:** before `registry.set(id, ...)` in `addPublisher`, check an `isActive` flag (set false in `reset()`, set true on call-start). If `!this.isActive`, run `el.pause(); el.srcObject = null; el.remove()` and return. One-line guard. This is an implementation note, not a design blocker — the design correctly models the intent. The implementer brief must call it out.

---

### B15 — Volume migration: CORRECT AND SUFFICIENT

**Normal migration path:** stored 1.3 → `readStoredVolume()` returns 1.3 → constructor `setVolume(1.3)` → `Math.min(MAX_VOLUME, 1.3)` with `MAX_VOLUME = 1.0` → `volume.signal(1.0)` → `persistVolume(1.0)` → next startup reads 1.0. Migration is idempotent (repeating produces 1.0 → 1.0). ✓

**First-run / no stored value:** `readStoredVolume()` at L669-678: `if (!stored) return DEFAULT_VOLUME` → DEFAULT_VOLUME = 1 → `setVolume(1)` → `Math.min(1.0, 1) = 1` → stored 1.0. No DOMException risk. ✓

**Non-finite stored value:** `Number.isFinite(parsed) ? parsed : DEFAULT_VOLUME` → returns DEFAULT_VOLUME = 1. Safe. ✓

**Controls-bar slider max:** requires changing the slider's `max` attribute from `1.3` to `1.0` so the UI is consistent with the now-clamped domain. `setVolume` already clamps, but a slider that visually shows max > achievable value is misleading. Locate controls-bar.component.html (the `<input type="range">` for volume) and set `max="1"`. This is a pure UI change — not a behavioral correctness issue.

---

### B16 — FIX-C diagnostics payload: CORRECT INTENT; ONE CONCRETE IMPL GAP

**What single field set proves "decoded AND audible on the selected sink":**
- `perPublisher[i].sinkId === selectedAudioOutputId` → element routed to selected device (or `''` = system default) → routing proven at JS level
- `perPublisher[i].paused = false` → element is actively playing
- `media-playout.totalAudioEnergy` INCREASING across two consecutive samples → browser decoded and played audio during that window (cumulative energy = sum of squared samples × dt; nonzero and increasing = real audio output)

Together: routing to selected device + element playing + energy increasing = "decoded AND audible on selected sink." This is the strongest proof possible from JS (we cannot assert the physical transducer, but we can assert browser-side routing and decoding). ✓

**Concrete implementation gap:** `media-playout` stat type is CURRENTLY NOT READ anywhere in sfu-client.service.ts. The entire `collectDiagnostics()` loop at L729-753 reads only `inbound-rtp` (L731: `if (stat.type !== 'inbound-rtp') continue`). `inbound-rtp.audioLevel` (L749: `audioLevel: numberOrNull(stat.audioLevel)`) is null on Chrome 113+ (field moved to `media-playout`). Result: the `audioLevel` in every `SfuInboundTrackStats` entry is null for every Chrome 113+ session — the diagnostic already broken.

**B16 requires adding a second pass in `collectDiagnostics()`:**
```typescript
// After inbound-rtp pass (L729-754) — add:
const playoutMap = new Map<string, { audioLevel: number|null; totalAudioEnergy: number|null; totalSamplesDuration: number|null }>();
for (const stat of stats.values()) {
  if (stat.type !== 'media-playout') continue;
  playoutMap.set(stat.id, {
    audioLevel: numberOrNull(stat.audioLevel),
    totalAudioEnergy: numberOrNull(stat.totalAudioEnergy),
    totalSamplesDuration: numberOrNull(stat.totalSamplesDuration),
  });
}
// Then cross-reference via inbound-rtp.playoutId:
// For each inboundTrack entry, find the matching media-playout entry via stat.playoutId → playoutMap.get(playoutId)
```

The `inbound-rtp` entry has a `playoutId` field (Chrome 113+) that references the `media-playout` entry's `id`. This is the join key. Without this, the B16 payload captures `perPublisher[].sinkId + paused` correctly (from the registry element directly), but the `audioLevel` / `totalAudioEnergy` fields in the diagnostics will be null — defeating the diagnostic purpose.

**B16 is correct and necessary. It requires explicit `media-playout` stat reading in `collectDiagnostics()` with `inbound-rtp.playoutId` as the join key.** This is currently absent from the codebase (grep of `media-playout` across all `.ts` files returns zero matches in sfu-client.service.ts).

---

## Q2 — Contradiction check + exact ordered addPublisher sequence

**B1-B16 scan for contradictions:** None found. Volume and mute have a single source of truth in `RemoteAudioService` signals (`volume`, `mutedAll`). Per-element state is derived at `addPublisher` time and propagated imperatively by `setVolume`/`setMutedAll`. No two requirements claim ownership of the same state field.

**One subtle double-set:** `el.muted = mutedAll()` AND `el.volume = mutedAll() ? 0 : min(volume, 1)` both silence muted audio. Redundant but harmless — `el.muted` is the authoritative DOM mute flag; `el.volume = 0` is a belt-and-suspenders backup. `setMutedAll(false)` must reset both: `el.muted = false` and `el.volume = volume()`. Not a contradiction, just redundancy. ✓

**The exact ordered addPublisher sequence — satisfying B1 + B3 + B9 + B13 together:**

```
addPublisher(id: string, stream: MediaStream): void {
  // B4 dedup — exactly ONE element per publisherClientId
  if (this.registry.has(id)) return;

  // B13 — NO autoplay attribute. Service owns play() exclusively.
  const el = document.createElement('audio');
  el.setAttribute('playsinline', '');
  el.setAttribute('data-remote-audio', '');        // querySelectorAll selector
  el.setAttribute('data-peer-id', id);             // B6: per-publisher watchdog/recovery targeting
  el.style.display = 'none';
  el.setAttribute('aria-hidden', 'true');
  // CRITICAL: el.autoplay is NOT set. Default = false.

  // Step 1: srcObject before setSinkId
  // (setSinkId applied AFTER srcObject — no sinkId-cleared-on-srcObject risk)
  el.srcObject = stream;

  // Step 2: B1 + B3 — volume/mute from service state, capped at 1.0 (never > 1.0 → no DOMException)
  el.volume = this.mutedAll() ? 0 : Math.min(this.volume(), 1.0);
  el.muted = this.mutedAll();

  // Step 3: B9 + A4 fix — setSinkId BEFORE play(), AWAITED (not fire-and-forget, not concurrent)
  // A Promise.all([setSinkId, play()]) would start play() before setSinkId resolves → A4 re-introduced.
  void (async () => {
    await this.applySinkId(el, this.selectedSinkId);   // SEQUENTIAL: must resolve before play()

    // Step 4: B12 / B7 — play() only after setSinkId resolved
    try {
      await el.play();
    } catch {
      this.notifyBlocked(id);                           // B8: remoteAudioBlocked signal set
    }

    // Step 5: append to DOM after full setup (querySelector finds it from here on)
    if (!this.isActive) {
      // B14 in-flight guard: reset() fired while we were awaiting setSinkId
      el.pause();
      el.srcObject = null;
      // el is not in DOM yet — no removal needed
      return;
    }
    document.body.appendChild(el);
    this.registry.set(id, { stream, el });
    this.registryVersion.update(v => v + 1);            // keepalive effect re-arm (R5 gap)
  })();
}
```

**The critical rule that must be stated in the implementer brief:**
> `applySinkId` MUST complete (`.then()` chain or `await`) before `el.play()` is called. Any form of concurrent execution (`Promise.all`, fire-and-forget) between `setSinkId` and `play()` re-introduces A4 and must never appear in this code path.

---

## Q3 — Silence hunt: every remaining path to no audible remote audio

| Silence path | Banner fires? | Auto-recovery path | SILENT-NO-BANNER blocker? |
|---|---|---|---|
| **Initial join — no autoplay policy yet (pre-gesture)** | YES — B8: element paused with srcObject → `allSinksPlaying()=false` → `remoteAudioBlocked=true` | YES — join gesture → `unlockAll()` → `play()` + `setSinkId` per element | NO |
| **Late joiner after gesture, desktop Chrome** | NO (sticky activation → `play()` succeeds) | N/A (plays immediately) | NO |
| **Late joiner after gesture, iOS Safari** | YES — `play()` fails → B8 banner within 15s keepalive | YES — user clicks "Enable audio" → `unlockAudioFromGesture(true)` → `unlockAndPlayRemoteSinks()` → `play()` in gesture | NO |
| **`setSinkId` fails — selected device unplugged / invalid** | NO — `applyMediaElementSinkWithDefaultFallback` (L85-111) catches error, clears stored ID, falls back `setSinkId('')` → element plays on DEFAULT device → not silent | N/A (transparent degradation) | NO |
| **`setSinkId` API unsupported (Firefox / iOS < 17 / old Android)** | NO — L91-92: `if (!withSink.setSinkId) return true` → element plays on DEFAULT device → not silent | N/A (default device) | NO |
| **Bluetooth handoff mid-call (OS reroutes)** | NO (brief gap while BT reconnects) | YES — `devicechange` event → `ensureSelectedAudioDevice` → `applySpeakerDevice` effect re-fires → re-applies sinkId to all elements | NO |
| **OS-level device disappears with no fallback** | NO — OS reroutes to new default; elements follow OS-assigned default | YES (OS-level) | NO |
| **All remote publishers muted at their source** | NO — correct behavior (publishers chose to mute) | N/A | NO — not a bug |
| **Publisher audio track never decodable (codec/ICE failure)** | NO — element `paused=false`, `srcObject` set → `allSinksPlaying()=true` → no banner | Voice watchdog fires if `bytesReceived` but no energy; **watchdog blind on Chrome 113+** (see below) | PRE-EXISTING LIMITATION — not introduced by design v2 |
| **Chrome 113+ — `inbound-rtp.audioLevel=null` — voice watchdog blind** | NO — watchdog samples null → `sampleUsable()=false` → `decideVoiceRecovery='none'` → no remediation; element appears playing | B16 diagnostics detect post-call | PRE-EXISTING (sfu-client.service.ts:L749 already reads wrong stat type since Chrome 113); B16 provides post-hoc detection but not live banner. Not new. |
| **Tab backgrounded / Chrome throttled** | NO (brief; elements may pause on mobile) | YES — `visibilitychange` → `handleRemoteAudioVisibilityRecovery` → `recoverRemoteAudio('visibility')` → B7 re-plays paused elements | NO |
| **Host sets `setVolume(0)` intentionally** | NO — intentional user action | N/A | NO — not a bug |
| **B11 wiring incomplete: tiles render `<audio data-remote-audio>` alongside registry elements** | NO — double audio (echo), not silence | N/A (loud, not silent) | NO — but produces echo; B11 wiring must be explicit (pass `[remoteAudioEnabled]=false` to all tiles) |
| **`addPublisher` in-flight + `reset()` race (B14 note)** | Potential brief leak; keepalive finds element | YES — 15s keepalive `recoverPlayback` with B7 | LOW RISK — mitigated by `isActive` guard in implementer brief |
| **`Promise.all([setSinkId, play()])` in `addPublisher` impl** | NO — first frames to default device, then correct device; may be imperceptible | N/A (brief routing to default, then corrects) | IMPLEMENTATION RISK — design correctly specifies sequential. Implementer brief must be explicit. |
| **`media-playout` not read in collectDiagnostics → diagnostic blind** | N/A (diagnostic, not playout) | N/A | NOT A PLAYOUT BLOCKER — but B16 is incomplete without the fix (see Q1) |
| **`registryVersion` signal missing → keepalive effect doesn't re-arm interaction recovery for late joiners** | YES (via 15s keepalive) | Partial — "Enable audio" button works; any-click recovery may not re-arm | NOT SILENT-NO-BANNER — banner shown, button works. Usability gap, not correctness gap. |

**SILENT-NO-BANNER verdict:** No new SILENT-NO-BANNER path exists in design v2. Every silence scenario either (a) shows a banner, (b) plays to default device with no banner (acceptable degradation), or (c) is a pre-existing limitation predating this redesign (Chrome 113+ watchdog blindness). The original bug class (wrong device, no banner, no recovery) is structurally eliminated by the per-publisher registry with `await setSinkId` before `play()`.

---

## Q4

**NO NEW ISSUE — design v2 complete.**

All findings in this round are implementation notes within B13-B16, not new architectural gaps:
- B14: in-flight `addPublisher` guard (`isActive` flag) — implementation note
- B16: `media-playout` stat reading in `collectDiagnostics()` with `playoutId` join key — explicitly absent from current code and must be added, but is within the B16 scope
- `registryVersion` signal for keepalive re-arm — noted in R5, remains a usability improvement (not a correctness gap)
- Chrome 113+ `inbound-rtp.audioLevel=null` watchdog blindness — pre-existing, partially addressed by B16 post-call diagnostics

No structural architecture issue remains unaddressed by B1-B16. The design is complete.

---

STATUS: AGREE — design v2 complete, no silent-no-banner path remains; B13/B15 correct and sufficient as written; B14 requires one implementation guard (`isActive` check before `registry.set` for in-flight `addPublisher`); B16 requires adding `media-playout` stat reading in sfu-client.service.ts `collectDiagnostics()` using `inbound-rtp.playoutId` as the join key (currently zero coverage of `media-playout` in codebase); addPublisher sequence is unambiguous with the explicit constraint that `applySinkId` MUST resolve before `el.play()` is called (no `Promise.all` or concurrent execution).
