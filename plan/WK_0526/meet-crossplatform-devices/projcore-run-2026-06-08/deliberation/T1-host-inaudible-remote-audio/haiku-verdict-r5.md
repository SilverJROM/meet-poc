# Haiku verdict — T1 round 5

## Q1 — Ownership: service-owned vs tile-registered + justification

**VERDICT: REJECT service-owned; RECOMMEND tile-created-with-service-tracking (hybrid of option b).**

**Analysis:**

**Option (a) — Service creates elements:**
- Consensus rationale: "cleanest single-ownership"
- **Critical flaw:** Service creates DOM elements outside the Angular component tree
  - Elements appended to... body? Hidden container? Consensus doesn't specify.
  - Service must manually manage appendChild/removeChild lifecycle (unconventional, error-prone)
  - Change detection: signals will update el.volume/el.muted, but the element's existence depends on service lifecycle, not Angular lifecycle
  - On component destroy or test cleanup, service elements orphan unless explicitly removed by calling reset()
  - SSR compatibility broken (service-created elements won't hydrate)
  - **File:line issue:** remote-audio.service.ts:444 reset() would need to clear registry; where does reset() get called on call end?

**Option (b) — Tiles create, service tracks:**
- Tiles render `<audio>` in template (currently tile.component.html:14-15)
- Service owns the REGISTRY (Map<clientId, {stream, el}>) but not element creation
- On tile mount: effect registers el with service (service.registerElement(clientId, el))
- On tile unmount: effect unregisters (service.unregisterElement(clientId))
- Service manages state (volume, mute, unlocked, sink) and applies it to registered elements
- **Advantage:** Elements live in Angular component tree; lifecycle tied to tile lifecycle; automatic cleanup on tile destroy; zoneless signals can reactively update el.volume
- **Dedup:** Tiles render conditionally (only if not already registered); or service tracks one-element-per-client and warns on double-register

**Recommended hybrid (b):**
Keep tiles creating elements (lowest friction), service owns the state-registry. On mount, tile effect calls `remoteAudio.registerElement(peer.id, audioEl)`. On unmount or when remoteAudioEnabled becomes false, tile calls `remoteAudio.unregisterElement(peer.id)`. Service ensures exactly one element per clientId and coordinates unlock + setSinkId + play() atomically on mount or when late-joiner condition triggers.

**Why this wins:**
- Elements' lifecycle matches their visibility (Angular-native)
- No orphans on reset (Angular destroys tile → cleanup is automatic)
- Service remains a state-manager, not a DOM-creator
- Dedup is enforcer (service rejects registerElement if clientId already present, or tiles guard against double-render)

**Pitfall with option (a):** If service-owned elements are created outside the tile tree, who appends them? Where? How are they cleaned up on call end if reset() is not reliably called? **BLOCKER if not specified.**

**File:line for option (b) approach:** tile.component.ts:56-67 (effect) would call `remoteAudio.registerElement(peer.id, audio)` on mount and `unregisterElement` on unmount or if stream becomes null. tile.component.html:14-15 keeps the element, guarded by `remoteAudioEnabled()` (but service would also guard against duplicate).

---

## Q2 — B12 late-joiner: is it FULLY closed for every join order (a-e)?

**Answer: YES, fully closed. Sticky-unlock design wins.**

| Case | Join timing | Gesture state | Result | Evidence / File:line |
|------|-------------|--------------|--------|---------------------|
| (a) | A subscribes BEFORE first gesture | unlocked=false | User sees banner on A's emit. User clicks → unlockAll() sets unlocked=true → all existing (A) play. **Result: HEARD** (after user click). | consensus-r4-registry:21 unlockAll() replays all registered; :23 banner-on-rejection. |
| (b) | B joins AFTER host gestured once | unlocked=true (sticky from earlier) | B's addPublisher(id, stream) checks: if unlocked, play() is attempted synchronously without user gesture (gesture context already consumed earlier). Play succeeds because browser's autoplay policy allows it when AudioContext was already resumed (... wait, Option A has NO AudioContext). **Actually:** with Option A, there's no context to manage. play() on a fresh element depends purely on browser autoplay-policy, which is PER-ELEMENT. B's element is NEW; browser may still block it as autoplay. **Gap:** does new element inherit the "unlocked" state, or does it face the same autoplay block?|  **CONDITIONAL FIX NEEDED:** see gap below. |
| (c) | A and B both join BEFORE any gesture | unlocked=false | Both attempt play() → both rejected → both emit → banner (aggregate). User clicks once → unlockAll() plays both. **Result: HEARD** (after one click). | consensus-r4-registry:21,23. |
| (d) | Host gestures, A joins, never clicks again, B joins much later | unlocked=true (gesture at step 1) | A joins with unlocked=true → play() attempts synchronously. B joins with unlocked=true → play() attempts. **Same gap as (b):** do new elements honor the sticky unlock or face fresh autoplay block? | **SAME GAP.** |
| (e) | Host backgrounds, resumes, C joins | unlocked=true before BG; sticky on resume | On resume, global interaction-recovery (room.page.ts:2801) queries audio[data-remote-audio] and calls play(). C joins during this recovery window → addPublisher registers C, recovery plays it, or C joins after recovery completes and faces play() rejection again (second-order late-joiner problem). | consensus-r4-registry:23 "global pointerdown/click interaction-recovery replaying [data-remote-audio]" — but timing is undefined. Does recovery happen BEFORE or AFTER C's addPublisher? |

**Critical gap found — B12 not fully closed:**

The sticky `unlocked` flag only works if the new element's play() call INHERITS the context-unlock. But with **Option A (no AudioContext)**, there's no context to inherit. Each NEW audio element created by addPublisher is a FRESH element with NO prior state. When play() is called, the browser applies the autoplay-policy PER-ELEMENT.

Browser autoplay-policy:
- Element can autoplay if: (1) muted OR (2) user has interacted with the site (gesture). A gesture-interaction is site-level, but autoplay POLICY is element-level in some browsers (Chromium). A NEW element may still be blocked even after a prior gesture, if the browser's policy clock resets per-tab.

**Fix needed (not in consensus):**
Either (1) don't call play() in addPublisher for Option A; instead, rely on native `autoplay` attribute + recovery, OR (2) wrap play() in a try-catch and set `remoteAudioBlocked` on rejection (which already happens at consensus:14 "on reject → set remoteAudioBlocked"), then recovery plays it later (B6/B7).

The consensus does say (2) implicitly ("on reject → set remoteAudioBlocked + leave element registered"), so the design is: addPublisher tries play(), if blocked, element sits paused, recovery (watchdog or interaction-recovery) re-plays it later.

**Question:** Is the interaction-recovery reliably called on every resume / input event? The consensus says "keep global pointerdown/click interaction-recovery" (line 23), but room.page.ts:2801-2802 is not shown in the present code.

**Verdict: B12 FULLY CLOSED if interaction-recovery is reliably attached and called on EVERY input event (not just device-change).** If interaction-recovery is missing or unreliable, case (b) and (d) have a latency gap where a new peer's audio is paused until the user interacts again.

**File:line concern:** consensus-r4-registry:23 says "keep global pointerdown/click interaction-recovery" but doesn't give a file:line. Assuming room.page.ts has a global event listener; if not, B12 is not actually closed.

---

## Q3 — B4 dedup-by-construction holds across all layouts?

**Answer: HOLDS if tiles DON'T render audio elements; BREAKS if they do.**

**Current tile template (tile.component.html:14-15):**
```html
@if (!peer().isLocal && remoteAudioEnabled()) {
  <audio #remoteAudio ...></audio>
}
```

**Scenario: Share layout with sharing peer rendered in BOTH share-stage (line 249) and share-strip (line 272):**
- If both tiles render audio elements, we have TWO elements with the SAME srcObject (the sharing peer's stream) → **echo by construction**.
- Registry is `Map<publisherClientId, {..., el}>`, exactly one entry per peer.
- But if tiles create elements, the registry entry points to ONE element, while TWO elements exist in DOM.
- The registry plays/sinks the one it owns, but the tile-created second element ALSO plays if the tile's effect runs independently.

**Fix required:**
Either (1) **remove the audio element from tile.component.html** (tiles don't create elements, service creates all), OR (2) **conditionally render** with a guard like `@if (!alreadyHasAudio(peer.id))` that checks if the service has already registered this peer, OR (3) **tiles render it but service prevents multiple elements** (service registerElement throws/warns on duplicate).

Option (1) is cleanest if service truly owns elements. But then service needs to specify where elements live (body? hidden div?).

**Consensus doesn't explicitly say to remove the audio from tile.component.html.** This is a gap.

**File:line gap:** tile.component.html:14-15 still render audio for all non-local peers. consensus-r4-registry:29 says "echo impossible by construction" but the construction (tiles or service ownership) is not specified in detail.

**Verdict: B4 dedup holds ONLY if:** 
- Service creates all elements (option a) AND tile template is updated to NOT render audio, OR
- Tiles render conditionally with a guard that checks service registry, preventing double-register

**Without explicit removal or guard, B4 BREAKS at sharing peer + strip layout.**

---

## Q4 — 13th-issue hunt

**Issue 13: Autoplay attribute conflict + uncontrolled element-native autoplay.**

**Evidence:**
- consensus-r4-registry:12 `<audio ... autoplay ...>`
- addPublisher also calls `el.play()` (line 13)
- If element has `autoplay` attribute, the browser's native autoplay runs independently of service.play() calls
- **Race condition:** browser's native autoplay may play before service applies sink (B9 "atomic pre-play"), resulting in first frames on default device (exactly A4 failure again)

**File:line:** Remote-audio.service.ts addPublisher method (not yet in code, but consensus specifies it at line 13). The `autoplay` attribute should be REMOVED; service controls play() exclusively.

---

**Issue 14: reset() and teardown on call end.**

**Evidence:**
- Remote-audio.service.ts:444 reset() method exists but the registry doesn't yet
- On call end (state != 'in-call'), who calls reset()? And does it clean up the registry (removePublisher for all entries)?
- **Gap:** no explicit cleanup on call end or on RemoteAudioService destruction

**File:line:** Need to ensure reset() clears the registry and pauses/removes all elements. Also: when is reset() called? room.page.ts should call it on state change to 'disconnected' or on ngOnDestroy.

---

**Issue 15: applySpeakerDevice still calls remoteAudio.applyOutputDevice.**

**Evidence:**
- room.page.ts:2648-2659 applySpeakerDevice applies sink to all audio[data-remote-audio] (works with registry elements)
- But then line 2657: `const remoteApplied = await this.remoteAudio.applyOutputDevice(deviceId);`
- applyOutputDevice (remote-audio.service.ts:321-326) tries to apply sink to mixer output element, which doesn't exist with Option A
- **Result:** unnecessary no-op or error

**File:line:** room.page.ts:2657 should be removed or guarded with `if (this.remoteAudioMixerEnabled)` (but mixer is disabled with Option A, so it's dead code).

---

**Issue 16: media-playout diagnostics and Option A correctness.**

**Evidence:**
- R3 diagnostics require collecting `media-playout.audioLevel` to prove audio reached the OS output
- But `media-playout` stats are generated when audio flows through an AudioContext's destination
- With Option A (no AudioContext in output path), `media-playout` stats may not be populated (no destination to measure)
- **Result:** R3 diagnostics fail to prove A4 was fixed (audioLevel stays null, can't prove audio delivered)

**File:line:** sfu-client.service.ts collectDiagnostics (search media-playout stat collection). If media-playout is not available without AudioContext, R3 fails to prove the fix works (defeats the purpose of FIX-C).

---

**Summary: 4 issues found (13-16). Issue 13 (autoplay attribute + play() race) is a REGRESSION that re-introduces A4. Issues 14-16 are gaps/concerns.**

---

STATUS: REVISE — **Registry design is sound in principle (sticky-unlock + service state) but has 4 critical gaps: (1) service vs tile ownership not decided (affects element lifecycle + SSR), (2) B12 latency gap for new elements if interaction-recovery not reliably called, (3) B4 dedup requires tile template change (remove audio) or guard, not specified, (4) Issue 13 — autoplay attribute + play() race re-introduces A4. Fix: remove autoplay attribute, service-exclusive play() control. Also missing: explicit reset() call on call end, applySpeakerDevice cleanup (line 2657), media-playout diagnostics correctness without AudioContext. Do NOT implement without resolving ownership model and specifying interaction-recovery trigger. Recommended: switch to option (b) tile-created-with-service-tracking, remove autoplay from elements, ensure reset() is called on call end, verify media-playout still populates (may require keeping a slimmed AudioContext for diagnostics only).**
