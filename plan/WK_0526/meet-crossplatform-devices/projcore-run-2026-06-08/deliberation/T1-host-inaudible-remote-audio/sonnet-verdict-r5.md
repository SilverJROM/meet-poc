# sonnet verdict — T1 round 5

## Q1 — Ownership: service-owned vs tile-registered — pick + why

**Service-creates-and-owns is the correct call.** Tile-registers has an unresolvable B4 echo path: if two tiles for the same publisher (share-main + strip) both call `registerWithService(el)`, the registry dedup rejects the second — but the second tile's element still has `srcObject` set and is already playing (tile effect fired before or after registration). The registry cannot safely pause the second element without racing its `play()` call. Service-creates avoids this entirely: tiles render no audio.

**Pitfall 1 — tile `remoteAudioEnabled` produces double-audio (CRITICAL WIRING GAP in B11):**

`room.page.html:L14–15` (tile.component.html): `@if (!peer().isLocal && remoteAudioEnabled())` renders `<audio #remoteAudio>`. `room.page.html:L253, L273, L293` all pass `[remoteAudioEnabled]="!remoteAudioMixerEnabled()"`. When B11 flips `remoteAudioMixerEnabled = computed(() => false)` (room.page.ts:L222), `!false = true` → ALL tiles render `<audio>` elements AND tile effects (tile.component.ts:L56–67) call `el.srcObject = stream` + `audio.play()`. Simultaneously, the registry creates its OWN `<audio>` elements for the same publishers. Each publisher gets TWO playing elements → **double-audio / echo on every call.** This is worse than the bug being fixed.

Fix: in service-creates mode, all tiles must receive `[remoteAudioEnabled]="false"`. The cleanest way: add a separate `readonly registryModeActive = computed(() => !this.remoteAudioMixerEnabled())` (or just hardcode `false`), and replace `!remoteAudioMixerEnabled()` with `false` in the three tile bindings at room.page.html:L253/L273/L293. B11 must include this change explicitly — simply flipping `remoteAudioMixerEnabled` is not sufficient.

**Pitfall 2 — `reset()` doesn't clean up registry elements (LEAK):**

`reset()` at remote-audio.service.ts:L444–462 calls `clearSources()` (L445) which clears only the mixer `sources` Map. Service-created registry `<audio>` elements are appended to `document.body` (same pattern as `createKickstartElement` at L552–566). They are NOT touched by `clearSources()` or any existing `reset()` step. At call-end, `cleanupCall()` calls `this.remoteAudio.reset()` (room.page.ts:L2507). Without registry cleanup, all registry elements remain in DOM with live `srcObject` references → on rejoin: `querySelectorAll('[data-remote-audio]')` in `unlockAndPlayRemoteSinks` (L282), `allSinksPlaying` (L386), and `recoverPlayback` finds STALE elements → stale sinkId applications, stale paused-state counts in banner logic, possible stale audio from prior session. Fix: `reset()` must call `clearRegistry()` before `clearSources()`. `clearRegistry()` iterates the registry Map → `el.pause(); el.srcObject = null; el.remove()` per entry → clear the Map.

**Angular/zoneless concerns — none additional beyond existing patterns:**
- Service DOM creation: same as `createKickstartElement` at L552–566 (already works, no Angular zone involvement needed). ✓
- Zoneless signal updates: registry `addPublisher`/`removePublisher` can update a `registryVersion` signal → change detection scheduled normally. ✓
- `querySelectorAll('video, audio')` in `applySpeakerDevice` (room.page.ts:L2648): registry elements appended to `document.body` ARE found by document-scoped selectors. ✓
- B9 (layout-transition sinkId loss) — **solved by construction in service-creates mode.** The registry element for publisher A is created once when A's stream arrives and persists until A departs. When A starts screen-sharing → share-main tile created, grid tile destroyed → tile instances recreated, but registry element unchanged, continues playing with the already-applied `sinkId`. Layout transitions do NOT reset sinkId on registry elements. B9 is a non-issue in service-creates mode. ✓

---

## Q2 — B12 join-order table

Design assumptions: registry `unlocked` flag set sticky on join gesture; `addPublisher` calls `play()` after `setSinkId`; B7/B8 fixes in place; keepalive (15s) calls `recoverPlayback` → B7 iterates elements → `play()` attempts; `contextState = 'none'` always in Option A.

| Case | Join order | Result | File:line that saves it or gap |
|------|-----------|--------|-------------------------------|
| **(a)** | A subscribes BEFORE host's first gesture | **NEEDS-CLICK (banner shown) ✓** | `addPublisher(A)` → `play()` fails (no activation) → element paused with srcObject → B8: `hasAudioToPlay = peers().some(!isLocal && !!stream) = true`, `allSinksPlaying() = false` → `remoteAudioBlocked.set(true)` (banner) → host clicks join → `unlockAudioFromGesture(false)` at join():L853,L861 → `unlockAndPlayRemoteSinks()` at remote-audio.service.ts:L282–292 → finds element → `setSinkId + play()` → HEARD |
| **(b)** | B joins AFTER host gestured once (desktop) | **HEARD ✓** | `addPublisher(B)` → `play()` in microtask after `syncPeers` effect → desktop Chrome grants sticky activation → succeeds → `setSinkId(selectedDevice)` pre-applied → playing on selected device |
| **(b)** | B joins AFTER host gestured once (iOS Safari) | **NEEDS-CLICK (banner shown) ✓** | iOS activation window may have closed → `play()` fails → paused element → B8 banner → user taps "Enable audio" → `enableRemoteAudio()` → `unlockAudioFromGesture(true)` → loop finds B's element → HEARD. NOT silent. |
| **(c)** | BOTH A and B join before any gesture | **NEEDS-CLICK (banner shown) ✓** | Both `addPublisher` → both `play()` fail → banner immediately → join gesture → `unlockAndPlayRemoteSinks()` → both elements `setSinkId + play()` → HEARD concurrently ✓ |
| **(d)** | Host gestures → A joins → host never clicks again → B joins much later | **HEARD (desktop) or NEEDS-CLICK (banner shown, iOS)** — **with one sub-gap** | Desktop: sticky activation → `addPublisher(B)` → `play()` succeeds. iOS: `play()` fails → banner shown (B8 via keepalive within 15s) → user clicks "Enable audio" → HEARD. **Sub-gap:** the global interaction recovery (pointerdown/click anywhere) may NOT be re-armed for B's join. Here is why: the keepalive/context effect at room.page.ts:L661–681 reads `contextState()`, `sourcesVersion()`, `state()`. In Option A: `contextState='none'` forever, `sourcesVersion` never changes (mixer disabled → `addSource` never called, L464). The effect only fires on entry to 'in-call'. When the interaction handler fires once (L2815–2819) it calls `this.uninstallRemoteAudioInteractionRecovery()` and is never re-installed. For B's late join, the keepalive effect never re-fires (no dependency change) → `installRemoteAudioInteractionRecovery()` is NOT called again. Any click/tap on page does NOT auto-recover B's element. The user must specifically click the "Enable audio" banner button. Banner IS shown → NOT silent. Fix: add `registryVersion = signal(0)` to RemoteAudioService, increment in `addPublisher`/`removePublisher`, and read it in the keepalive effect alongside `sourcesVersion()` → effect re-fires on publisher add → L674 re-installs interaction recovery. |
| **(e)** | Host backgrounds/resumes → C joins after resume | **HEARD or NEEDS-CLICK (banner shown)** — same sub-gap as (d) | `visibilitychange` → `handleRemoteAudioVisibilityRecovery` → `recoverRemoteAudio('visibility')` → B7 `play()` on A and B's elements → both recovered. C joins → `addPublisher(C)` → `play()` → desktop: likely succeeds. iOS: may fail → banner shown within 15s keepalive → `registryVersion` sub-gap same as (d). NOT silent. |

**No case is SILENT-NO-BANNER (permanent silence with no banner).** The B8 banner fix ensures `remoteAudioBlocked = true` whenever any registered element is paused and a stream exists. The 15s keepalive is the backstop. The only gap is that auto-recovery from "any page click" (not just the "Enable audio" button) is uninstalled and not re-armed for late joiners — this is usability friction, not the original silent bug.

---

## Q3 — B4 dedup-by-construction holds?

**Holds IF AND ONLY IF tiles render no audio elements (Pitfall 1 from Q1 fixed).**

In service-creates mode with tiles' `remoteAudioEnabled = false`:

1. Registry keyed by `clientId` (= `peer.id`, room.page.ts:L332). `clientId` is stable per connection and unique per live session. `participantId` is NOT used (B-key-collision risk: same participant rejoins with new `clientId` but same `participantId` — old entry not cleaned up yet → collision if keyed by `participantId`). ✓

2. Strip tile dedup by construction: `orderedStripPeers = computed(() => this.peers())` at room.page.ts:L444 returns ALL peers including the sharing peer. The strip tile for publisher A renders when A is sharing AND strip is visible (room.page.html:L270–275). In service-creates mode, that strip tile passes `[remoteAudioEnabled]=false` → renders no audio element. The registry has exactly ONE element for A (created when A's stream first arrived). Zero audio elements from tiles = zero double-audio. ✓

3. Share-main tile: same. `[remoteAudioEnabled]=false` → no `<audio>` in share-main tile. Registry element persists. ✓

4. Screen + camera from same publisher: `peers()` carries only the camera stream (`streams.get(clientId)`, room.page.ts:L331). `remoteScreenStreams()` is separate and not passed to `syncPeers`. `addPublisher` is called with the camera/voice stream only → one registry entry per publisher. Screen share audio does not create a second registry entry. ✓

5. Rejoin race: publisher B leaves → `tearDownPeerSubscription` → `peerIdentities` loses B → `peers()` updates → `syncPeers` → `removePublisher(B)` → element removed from DOM, map cleared. B rejoins → new clientId → new `peerIdentities` entry → new `addPublisher(B_new, stream)` → fresh element. Old entry fully cleaned before new one created. ✓

6. Stream change mid-call (reconnect): `syncPeers` detects `current.stream !== peer.stream` → `removePublisher(id); addPublisher(id, newStream)` — same pattern as current `removeSource`/`addSource` at L253–258. New element gets fresh `setSinkId` + `play()`. ✓

**B4 holds by construction in service-creates mode with the Q1 Pitfall 1 fix applied.** If tiles still render audio elements (Pitfall 1 unaddressed), B4 breaks for EVERY publisher simultaneously — the double-audio is structural, not an edge case.

---

## Q4 — 13th issue

### Issue 13 — `reset()` does not clear registry elements → DOM leak + audio-from-prior-session on rejoin

File: `remote-audio.service.ts:L444–462` (`reset()`).

**Root:** Service-created registry `<audio>` elements are appended to `document.body` (same pattern as `createKickstartElement` at L552). `reset()` calls `clearSources()` at L445 → iterates the mixer `sources` Map → calls `destroyKickstartElement` (L489) for kickstart elements. But the registry's `<audio>` elements are in a SEPARATE Map (`Map<clientId, {stream, el}>`). `reset()` has no equivalent `clearRegistry()` call.

**What happens:** At call-end, `cleanupCall()` at room.page.ts:L2506–2507 calls `this.activeSpeaker.reset()` then `this.remoteAudio.reset()`. Registry `<audio>` elements remain attached to `document.body` with `srcObject` still pointing to the call's MediaStreams. On next call:

1. `unlockAndPlayRemoteSinks()` at L282: `querySelectorAll('audio[data-remote-audio]')` finds stale elements → applies `setSinkId` to them → calls `el.play()` on stale elements. If the prior-session streams are still live (ICE not fully torn down), stale audio plays.
2. `allSinksPlaying()` at L385–396: finds stale paused elements (stream ended, element paused) → `perPeerAllUnpaused = false` → `evaluateRemoteAudioPlayability = false` → `remoteAudioBlocked = true` spuriously during new call setup.
3. On new `addPublisher(A, stream_new)` for the same publisher (same `clientId`): registry dedup sees `id` not in map (map was reset) → creates SECOND element. Now DOM has TWO elements for A: the stale one (paused, old srcObject) and the new one. The stale element counts in `allSinksPlaying()` as paused → banner flicker on every peer that was in the prior call.
4. Stale `kickstartElement`-equivalent registry elements are not paused → `srcObject` still holds WebRTC track reference → MediaStream/RTCPeerConnection is not GC'd → potential connection resource leak.

**Fix:** `reset()` must call `this.clearRegistry()` before `clearSources()`. `clearRegistry()` iterates the registry Map → for each `{el}`: `el.pause(); el.srcObject = null; el.remove()` → `registry.clear()`. This is the exact pattern of `destroyKickstartElement()` at L568–576 applied to all registry entries.

---

### Secondary gap (not Issue 13 but noteworthy): `registryVersion` signal missing — keepalive effect not re-armed for late joiners

Documented in Q2 case (d). The keepalive/context effect at room.page.ts:L661–681 never re-fires in Option A because its dependencies (`contextState='none'`, `sourcesVersion=0`) never change after entering 'in-call'. The interaction recovery installed once (on entry) is consumed by the first `pointerdown`/`click` and never re-installed for late joiners. The banner IS shown (B8 + 15s keepalive), so this is NOT the original silent bug. But on iOS, the user must click specifically the "Enable audio" button rather than anywhere on screen.

Fix: add `readonly registryVersion = signal(0)` to `RemoteAudioService`, bump it in `addPublisher`/`removePublisher`. Read it in the keepalive/context effect at room.page.ts:L661 alongside `sourcesVersion()`. Effect re-fires on every publisher change → L674 re-installs interaction recovery → any pointerdown/click auto-recovers late joiners.

---

STATUS: REVISE — two fixes required before implementation: (1) B11 wiring is incomplete — flipping `remoteAudioMixerEnabled` to `false` causes `!remoteAudioMixerEnabled() = true` on tile audio bindings → tiles render `<audio>` elements simultaneously with service-created registry elements → double-audio on every call; tiles must receive `[remoteAudioEnabled]="false"` in service-creates mode (room.page.html:L253/L273/L293); (2) `reset()` at remote-audio.service.ts:L444 must call `clearRegistry()` before `clearSources()` or service-created elements leak across calls and corrupt the next session's banner and playability state; additionally recommend adding `registryVersion` signal for keepalive effect re-arming (cases d/e late joiners on iOS).
