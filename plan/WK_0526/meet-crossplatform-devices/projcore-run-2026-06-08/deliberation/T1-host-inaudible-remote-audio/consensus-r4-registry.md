# T1 — FINAL fix design after R4 (2026-06-08) — the central per-publisher audio registry

Builds on consensus-r3-revised.md (Option A, unanimously confirmed R4). R4 added B11 + B12 and sharpened B1/B8/B9 into a single coherent mechanism: a **central per-publisher audio-element registry owned by RemoteAudioService**. This file is the design R5 must validate.

## Why a central registry (not the raw tile effect)
The current tile audio effect (tile.component.ts:56-67) plays BEFORE applying sink/volume/mute and depends on a later room effect for the sink → first-tile race (codex55/gpt54). And nothing auto-unlocks late joiners (B12). A central registry in RemoteAudioService fixes all of it in one owned place and keeps state (volume/mute/unlocked) authoritative.

## The registry (RemoteAudioService — replaces the mixer graph as the audible path)
State: `Map<publisherClientId, { stream, el: HTMLAudioElement }>`, plus `volume`, `mutedAll`, `unlocked` (sticky), `selectedSinkId`.

**addPublisher(id, stream):** (dedup by publisherClientId — exactly ONE element per publisher, key by peer.id NOT participantId — gpt54 B-key-collision)
1. create `<audio data-remote-audio playsinline>` — **NO `autoplay` attribute** (see B13; service controls play() exclusively); `el.srcObject = stream`.
2. **ATOMIC pre-play:** `el.volume = mutedAll ? 0 : min(volume,1)`; `el.muted = mutedAll`; `await setSinkId(selectedSinkId)` (default-fallback) — ALL before play (B1/B3/B9).
3. `el.play()`; on reject → set `remoteAudioBlocked` + leave element registered (B8); the sticky-unlock recovery will replay it.
4. append to DOM; store in map.

**removePublisher(id):** pause, null srcObject, remove from DOM + map (no orphan; B leaves/rejoins clean).

**setVolume / setMutedAll:** update state AND iterate registry: `el.volume`/`el.muted` per element (B1). State stays here (B10 — service kept, slimmed).

**unlockAll() (called from a REAL gesture — join + global pointerdown/click recovery, room.page.ts:2801):** set `unlocked=true`; for every registered el: `setSinkId` + `el.play()` (B7/B12). Sticky: once unlocked, addPublisher's play() succeeds for late joiners.

**B12 late-joiner:** addPublisher calls play(); if `unlocked` already true (host gestured earlier) it succeeds; if not yet, play() rejects → banner → first host click unlocks all. PLUS: keep the global pointerdown/click interaction-recovery (room.page.ts:2801-2802) replaying `[data-remote-audio]` so ANY interaction recovers late joiners.

**recoverVoicePlayout / recoverPlayback (B6/B7):** per-element `setSinkId` + `play()` for the stalled/all publisher(s), independent of any AudioContext.

## Wiring changes
- **B11 (spark):** flip `remoteAudioMixerEnabled` (room.page.ts:222) + `RemoteAudioService.mixerEnabled()` (191-193) OFF, or remove the mixer-audible branch entirely; tiles render `<audio>` but the REGISTRY owns them (or tiles register with the service on mount). Either: (a) service creates the elements (cleanest), or (b) tile creates element + registers it with service on mount/unmount. Pick (a) for single-ownership.
- **B4 share dedup:** registry guarantees ONE element per publisherClientId regardless of how many tiles render that peer (grid/share-stage/strip/pip) → echo impossible by construction.
- **B5 mid-guard:** reclaim-safe at sfu-client.service.ts:1753 (clear stale owner / rollback+renegotiate, never permanent-stop) + 2-publisher test.
- **B8 banner:** `remoteAudioBlocked` = (registry non-empty AND any el paused/blocked). Replace hasSources/outputPlaying (room.page.ts:650-659, 2685).
- Remove redundant muted kickstart elements (remote-audio.service.ts:552) — registry elements replace them.
- Retire AudioContext graph (gain/limiter/destination/keepalive) from the audible path (A3 impossible). Keep volume/mute STATE.

## Costs (accepted, documented)
- No >100% boost (cap UI at 100%, B3). No feedback limiter (B2 — browser AEC; remote use). Recorder unaffected (independent — opus R4).

## FIX-C diagnostics (unchanged, still required)
media-playout audioLevel/totalAudioEnergy + per-element {paused, muted, sinkId, srcObjectAttached} + remoteAudioContextState(or n/a) + emit. Proves next call delivered to selected device.

## R5 additions (design v2 — 4 new concrete requirements)
- **B13 (CRITICAL — prevents A4 re-introduction):** the registry `<audio>` element MUST NOT have the `autoplay` attribute. Native autoplay would fire BEFORE the service applies `setSinkId`, sending first frames to the DEFAULT device = exactly A4. The SERVICE calls `el.play()` EXCLUSIVELY, and only AFTER `srcObject` + volume/mute + `setSinkId` are applied (the atomic pre-play sequence). Element created with NO autoplay attr; keep `playsinline`.
- **B14 (leak/teardown):** `reset()` (remote-audio.service.ts:444-462) and the in-call→not-in-call effect MUST call `clearRegistry()` BEFORE `clearSources()`: for each registry entry `el.pause(); el.srcObject = null; el.remove()`, then `registry.clear()`. Otherwise body-appended elements leak, stale prior-session audio can replay on rejoin, a 2nd element can be created for the same publisher, and the RTCPeerConnection/MediaStream is not GC'd.
- **B15 (volume migration):** on startup migrate stored volume to `min(parsed, 1)` and persist the clamped value; lower the slider max (controls-bar) from 1.3 to 1.0. Prevents service-state 1.3 vs playback-1.0 UI/audio divergence.
- **B16 (FIX-C concrete payload):** add a first-class `RemoteAudioPlayoutDiagnostics` type to meeting-sessions.service.ts: `{ selectedAudioOutputId, unlocked, blockedPeerIds[], perPublisher: [{publisherClientId, trackId, paused, muted, volume, sinkId, srcObjectAttached, readyState}] }` + the `media-playout` getStats fields (audioLevel/totalAudioEnergy/totalSamplesDuration). Populate in `buildDiagnosticsPayload()` (room.page.ts:3498-3525) alongside sfuDiagnostics; render on the diagnostics page. Redact/label device IDs (default vs selected). This is what makes the NEXT call definitively prove selected-output playout.
- **B11 reaffirmed (spark):** flipping `remoteAudioMixerEnabled`/`mixerEnabled()` off is non-trivial — the page's banner + recovery effects (room.page.ts:650-680) and `[remoteAudioEnabled]="!remoteAudioMixerEnabled()"` bindings are hardwired to mixer mode. The implementer must rewire these to the registry branch, not just flip a boolean.

## R6 additions (design v2.1 — wiring + robustness, the last silent-no-banner closers)
- **B17 (CRITICAL — wiring):** addPublisher/removePublisher are DRIVEN by the existing remote-streams effect (room.page.ts:635 `syncPeers(this.peers())`): syncPeers becomes a diff that calls `addPublisher(id,stream)` for new/changed publishers and `removePublisher(id)` for departed ones. Without this explicit wiring a peer joins but gets no element = silent. Name it in the implementer brief.
- **B18 (setSinkId hang → silent):** wrap the in-addPublisher `setSinkId` in `withTimeout(..., ~2s)`; on timeout, proceed to `play()` anyway (audio reaches the default sink, audible) + log. A hung device-enumeration must NEVER block play().
- **B19 (play() catch audit):** EVERY `play()` call site (addPublisher, unlockAll, recoverVoicePlayout, recoverPlayback, visibility/pageshow recovery) MUST `.catch()` → set `remoteAudioBlocked`. An unhandled rejection = silent with no banner.
- **B20 (sink reject handling):** keep `applyMediaElementSinkWithDefaultFallback` (already falls back to '' default); if BOTH selected and default fail, set blocked. B16 payload logs `{selectedSinkId, effectiveSinkId, sinkApplied}` so a wrong-device case is visible.
- **B14-guard (race):** addPublisher checks a `disposed`/not-in-call flag before append+register; reset()/leave sets it first. Prevents reset()↔in-flight-add orphan. (Single-threaded JS + this flag is sufficient; no full queue needed since add steps are synchronous except the awaited setSinkId — re-check the flag AFTER the await, before append.)
- **Preserve existing recovery hooks:** `recoverRemoteAudio('visibility')` (room.page.ts:2876) + pageshow (2852) ALREADY exist — rewire them to registry per-element replay (do NOT delete). This is how background→resume re-plays elements.
- **B16 verify:** confirm `media-playout` getStats type is produced WITHOUT a Web-Audio AudioContext (it reflects RTCRtpReceiver playout, so it should be). If unavailable, the proof tuple degrades to `inbound totalAudioEnergy rising AND element.sinkId==selected AND element.paused==false`.

### Environmental paths (NOT bugs, NOT silent-no-banner in JROM's Chrome — DETECTED by B16, no code fix):
OS-exclusive-audio-device, background-tab OS throttle, undecodable/silent publisher track, all-remote-muted-by-app. Catalogued in silence-hunt (R6); B16 diagnostics surface them; not in fix scope.

## R7 additions (design v2.2 — doc precision; NO new failure mechanism)
- **B21 (codex55/gpt54): B17 diff predicate is by TRACK identity, not just stream.** "Changed publisher" = `publisherClientId` present AND (`stream` identity changed OR the current live AUDIO TRACK id changed) — mirrors remote-audio.service.ts:243-257. A publisher unmuting mid-call yields a NEW audio track on the same stream/clientId; addPublisher must update `el.srcObject` to the new track, else the unmute is inaudible. (Maps to the existing `currentAudioTrack` logic.)
- **B14 post-play guard (codex55):** re-check the `disposed`/not-in-call flag AFTER `await el.play()` too (not only after setSinkId) before treating the element as live-registered.
- **B22 (haiku): mute-all visible indicator.** `setMutedAll(true)` is INTENTIONAL silence (not a bug) — but ensure the controls-bar mute-all button shows a clear ON state so the host never mistakes self-muted-all for "broken audio". UI-clarity, not a playout bug. (Likely already shown by the toggle state; implementer verifies.)
- **Doc fix:** the addPublisher step-1 `autoplay` text corrected to match B13 (no autoplay attr). v2.2 is now internally consistent.
- **spark meta-point (valid):** all B1-B20 are DESIGN, not yet code. The remaining validation of this nature requires the ACTUAL implemented diff — abstract-design red-teaming has reached its useful limit (R7 found only doc-precision). The 3-consecutive-clean RED-TEAM gate has the most value applied to the IMPLEMENTED CODE.

## DESIGN-CONVERGENCE NOTE (projcore, after R7)
Root cause (A4 sink-routing + A3 orphaned-graph; B=sequential) is unanimous across 7 rounds. Fix architecture (Option A central per-publisher registry, no AudioContext) is unanimous. 22 numbered requirements (B1-B22) + ordered addPublisher sequence + wiring + silence-hunt captured. R6→R7 findings degraded from "real blockers" to "doc precision". gpt54 R7: "no remaining in-scope silent-no-banner runtime path in Chrome." This is the signature of a converged design. Recommendation surfaced to JROM: lock v2.2, implement, then apply the 3-clean red-team gate to the real code (where it catches what prose review cannot — the prior FIX1-5 passed review yet failed live).
1. Is single-ownership (service creates elements) vs tile-registers-with-service the right call? Any Angular lifecycle/SSR/zoneless pitfall?
2. Does the sticky-unlock + global-interaction-recovery FULLY close B12 for every join-order (A before gesture, B after gesture, both after)?
3. Re-verify B4 dedup-by-construction holds across ALL layouts.
4. Trace once more; find a 13th issue or declare "NO NEW ISSUE — registry design complete" (→ streak step).
