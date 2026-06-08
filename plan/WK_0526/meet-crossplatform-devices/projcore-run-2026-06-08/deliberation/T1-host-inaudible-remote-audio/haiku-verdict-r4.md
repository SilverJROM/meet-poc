# Haiku verdict — T1 round 4

## Q1 — Architecture: Option A confirmed? (or alternative + why)

**CONFIRMED: Option A is the correct architecture call.**

**Evidence:**
- **Closes A3 (orphaned graph) by structure:** No Web-Audio graph in output path → no nodes to become orphaned → impossible to fail. (remote-audio.service.ts orphaned-node bug at line 508-535 is structurally eliminated.)
- **Closes A4 (sink routing fragility) by structure:** Per-publisher `<audio>` elements with native setSinkId are the WebRTC-proven sink path (Google Meet uses this). Direct MediaStream → element → setSinkId is reliable; no Web-Audio-destination-stream fragility. (A4 setSinkId-on-WebAudio-destination at line 652 eliminated.)
- **Closes A1/A2 (gesture/autoplay) by structure:** No AudioContext to manage, no context suspend/resume required. Tile audio elements play natively per HTML autoplay policy + gesture unlock. Policy is browser-enforced, not us-managed.
- **Defect cost trade-off:** Lose 1.3x volume boost (cap at native HTML element's 1.0 max) + lose feedback limiter (no same-room miking on remote audio, acceptable per consensus). Gain simplicity, robustness, Match-proven design.
- **Option B rejected:** Per-element GainNode → MediaStreamDestination → `<audio>` re-introduces the exact A4 sink-routing fragility (Web-Audio destination stream again). Same fragility, more complexity.

**Dependency audit (searching "AudioContext/contextState/mixer" for undeclared consumers):**
- remote-audio.service.ts: AudioContext used ONLY in mixer code (ensureGraph, resume, contextState signal). With Option A (mixer retired), no remaining audio-output dependencies on AudioContext.
- room.page.ts: contextState read only in banner logic (line 651-659: `contextState === 'running'`). With Option A, banner refactored to track per-element paused state (B8), not contextState. No breaking dependency.
- active-speaker.service.ts: creates its own independent AudioContext. Unaffected by Option A.
- No other services depend on RemoteAudioService's AudioContext.

**Conclusion:** Option A is architecturally sound. It eliminating both proven-by-elimination root causes (A3 + A4) by structural impossibility, not by patching.

---

## Q2 — B1-B10 verification table

| # | Blocker | Status | Verification / Issue |
|----|---------|--------|----------------------|
| B1 | volume + mute-all no-op | **NEEDS CLARIFICATION** | setVolume/setMutedAll must iterate `audio[data-remote-audio]` and set el.volume + el.muted. Consensus says "tile audio effect reads volume()/mutedAll() reactively". But tile.component.ts has NO dependency on RemoteAudioService. Requires: (1) tile component inject RemoteAudioService, (2) effect adds deps on volume()/mutedAll() signals, (3) effect applies to el.volume/el.muted. OR RemoteAudioService imperatively manipulates all elements on setVolume/setMutedAll (DOM-intrusive). Design gap: which approach? Implementation must specify. **Blocker unless one approach chosen.** |
| B2 | feedback limiter lost | OK | Accepted removal; documented tradeoff. No same-room micing risk for remote audio. Acceptable. |
| B3 | 130% boost impossible | OK | Cap volume UI to 100% in controls-bar. Clear user-facing change; acceptable. |
| B4 | share-layout double-audio echo | **INCOMPLETE FIX** | Consensus: "Enforce EXACTLY ONE audible `<audio data-remote-audio>` per publisherClientId. In share layout, mute/omit the duplicate tile's audio". But HOW? The sharing peer renders in TWO tiles (room.page.html:249/272). Solution is hand-wavy: "Add a guard/dedup keyed by peer id" does not specify WHERE this logic lives or HOW tile dedup is enforced. Suggested fix: (1) room.page.ts: compute set of peers-already-audio'd, pass to tile as input, (2) tile.component.ts: @if `remoteAudioEnabled && !alreadyAudiod(peer.id)`. **Needs concrete implementation before code.** |
| B5 | mid-guard reclaim-safe | **NEEDS IMPLEMENTATION DETAIL** | Consensus: "if prior owner is stale/departed, CLEAR its mapping then set new; only on TRUE live conflict, rollback". But the code site (sfu-client.service.ts:1753) just does `this.midToEntry.set(rt.mid, entry)`. Guard must check: (1) if mid already exists, look up prior owner by looking up `this.remotePublishers().get(priorOwnerClientId)`, (2) if prior owner not in roster, clear old mapping, (3) if prior owner IS in roster AND differs from current publisher, only then rollback. This requires: (a) access to remotePublishers roster, (b) explicit cleanup on publisher departure. Consensus doesn't specify cleanup trigger (removePeer on peer-left, or clearPublisherSubscriptionStateForRetry on retry). **Needs code-level detail to prevent false positives.** |
| B6 | recoverVoicePlayout !mixerEnabled path | **OK in principle, incomplete spec** | Current code early-returns on !mixerEnabled (line 352). Consensus: "add per-element recovery path: re-play() + re-setSinkId the [data-remote-audio] element for the stalled publisher." Correct approach. But triggers are unspecified: when does recoverVoicePlayout get called for per-element audio? Watchdog detects audioLevel=0 in getStats, but with Option A, where does audioLevel come from? (R3 diagnostics add media-playout.audioLevel, but is it wired into the watchdog check?) **Blocker: watchdog must be re-architected for per-element detection.** |
| B7 | recoverPlayback !mixerEnabled | **OK in principle** | Similar to B6: early-return eliminated, per-element play() calls added. But triggers unspecified (interaction recovery, keepalive, watchdog need to call this). **Blocker if triggers not defined.** |
| B8 | banner per-element authority | **INCOMPLETE FIX** | Consensus: "base remoteAudioBlocked on 'remote peers with streams exist AND any per-element is paused/blocked'". But HOW is per-element paused state tracked? Current code uses mixer.outputPlaying signal (element.paused via event listeners at line 219-227). With Option A, there's no mixer output element. Solution: (1) have tile emit play/pause state, (2) room tracks "any-tile-paused" computed signal, (3) banner depends on hasPeers && anyTilePaused. Consensus doesn't specify this. **Blocker: tile paused-state tracking must be designed.** |
| B9 | sinkId-before-play race | **OK** | "Apply selected sink in tile audio effect itself (before/at play)". Concrete: tile effect calls `await applySpeakerDevice()` before play(). Correct. Requires tile to have access to applySpeakerDevice + selectedAudioOutputId (dependency injection). **Solvable design detail, not a blocker.** |
| B10 | don't delete RemoteAudioService | **OK** | Keep slimmed service for unlock, sink routing, volume/mute state. Clear scope. Acceptable. |

**Summary of B1-B10:** B1, B4, B5, B6, B7, B8 have significant design gaps or incomplete specifications. B2, B3, B9, B10 are concrete. **At least 6 of 10 need implementation details before code commit.**

---

## Q3 — End-to-end trace: first breaking step

**Scenario:** join (host gesture) → host publishes → A subscribes on SELECTED device → B joins AFTER A is unlocked → host picks different device → volume slider → mute-all/unmute → A screen-share → A stops → B leaves/rejoins → background/resume → B starts talking.

**Trace:**

1. **Host clicks join (gesture context)** ✓
   - unlockAudioFromGesture called
   - unlockAndPlayRemoteSinks queries audio[data-remote-audio] (none exist yet)
   - No error
   - Status: OK

2. **Host publishes local audio/video** ✓
   - Local stream configured, state='in-call'
   - Status: OK

3. **Publisher A (Windows) joins, subscribes, audio rendered on SELECTED device** ✓
   - A joins roster, subscribeIfNeeded, ontrack fires
   - Tile A rendered, audio effect runs: audio.srcObject = A.stream
   - Effect calls audio.play() (non-gesture context) → rejected by autoplay policy
   - Effect emits remoteAudioBlocked
   - room.page.ts handler sets banner=true
   - **User MUST click to unlock.** User clicks.
   - unlockAudioFromGesture runs (gesture context)
   - unlockAndPlayRemoteSinks queries audio[data-remote-audio], finds A's element, applies selectedDevice sink, plays it
   - A's play() succeeds (gesture + sink applied)
   - Host hears A on selected device ✓
   - Status: OK

4. **Publisher B (phone) joins DURING or AFTER the gesture unlock** ← **FIRST BREAKING STEP**
   - B joins roster, subscribeIfNeeded, ontrack fires
   - Tile B rendered, audio effect runs: audio.srcObject = B.stream
   - Effect calls audio.play() (non-gesture, since it's running AFTER the gesture context exited) → rejected by autoplay policy
   - Effect emits remoteAudioBlocked
   - room.page.ts handler: remoteAudioBlocked.set(true) (but true was already set for A, so no visible change)
   - **User does NOT know B is blocked.** No new gesture. No unlock is triggered for B.
   - **B stays silent indefinitely** (unless watchdog or recovery detects it, but watchdog requires audioLevel data, which B doesn't have since play() was rejected).
   - Host hears A but NOT B. Should hear both concurrently (R2 requirement violated).

**Root cause of break:**
- The tile audio effect emits remoteAudioBlocked on play() rejection (non-gesture).
- The room handler sets a boolean flag, not per-element.
- If a flag is already true, a new emission doesn't trigger re-unlock.
- Peers joining after the first gesture don't auto-unlock.
- Room effect (line 634-640) tries to unlock on peers() change, but via setTimeout(0) which is non-gesture, so unlock fails.

**The fix gap:**
The revised design (consensus-r3) doesn't specify how to auto-unlock NEW peers that join after the initial gesture. B6/B7 add recovery methods, but triggers are unspecified. The watchdog requires audioLevel data (which needs fresh instrumented call + R3 diagnostics), so it can't immediately detect B's block.

**This is the first critical break: Peer B joins, plays rejected, stays blocked indefinitely.**

---

## New issue (11th+) found

**ISSUE 11 — Multi-peer autoplay unlock race: new peers joining after first gesture are not auto-unlocked.**

**Evidence:**
- tile.component.ts:63-65 emits remoteAudioBlocked on every play() rejection
- room.page.ts:1045-1046 sets a boolean flag on emission
- If flag already true, second emission is idempotent → no action
- room.page.ts:634-640 effect attempts re-unlock on peers() change via setTimeout(0) (non-gesture) → unlock fails
- **Result:** Peers A, C, D, E... that join after initial gesture remain blocked indefinitely.

**File:line:** room.page.ts:1045-1046, tile.component.ts:63-65, room.page.ts:634-640.

**Why this breaks the goal:**
- R2 requirement: "everyone audible concurrently; NO talker-limiting logic"
- JROM's no-suppress directive (north-star.md)
- Multi-peer scenario (call with 3+ participants) will have silent peers

**Concrete fix needed:**
One of:
A. **Per-element unlock tracking:** tile.component has a "needs-unlock" signal; room has a computed "any-tile-needs-unlock"; effect on that signal calls per-element unlock (recover-like).
B. **Banner per-element:** emit per-element blocked state; banner aggregates; user click triggers unlock-all, then new peers auto-unlock on join (requires redesigned banner).
C. **Sticky unlock state:** RemoteAudioService tracks "was-unlocked-this-session" signal; tile effect checks it and auto-plays new peers without user gesture (requires defining when session unlock expires).
D. **Watchdog immediate recovery:** watchdog checks not just audioLevel (unavailable until audio flows), but also play() rejection history; triggers recovery immediately on tile creation if prior unlock was called (requires watchdog redesign).

The consensus design does NOT specify which approach, leaving a gap.

---

## Summary

| Q | Result | Status |
|---|--------|--------|
| Q1 | Option A confirmed architecturally sound | ✓ AGREES |
| Q2 | B1-B10: 4 OK, 6 need implementation details | ⚠ INCOMPLETE |
| Q3 | First break: Peer B joins after unlock, stays silent | ✗ BREAKS AT STEP 4 |
| Q11 | Found: multi-peer unlock race | ✗ BLOCKER |

---

STATUS: REVISE — **Option A architecture is sound, but the revised design has a critical gap: peers joining after the initial gesture unlock are not auto-unlocked and stay silent indefinitely (violates R2 "everyone concurrent" + no-suppress directive). Six of ten R3 blockers need implementation detail before code. Do NOT implement as-is — would fail on the second remote peer in a multi-peer call. Must resolve B1/B4/B5/B6/B7/B8 design gaps + add explicit multi-peer unlock mechanism (per-element tracking OR redesigned banner OR sticky-unlock state) before code commit. This is a 4-round deliberation; at 30-round cap with 3-clean-streak gate, recommend converging on ONE of three unlock mechanisms in R5 consensus-revision.**
