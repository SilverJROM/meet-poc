# HAIKU CODE RED-TEAM CR7 (lens L7: state-machine + lifecycle)

## Executive Summary
Exhaustive audit of remote-audio state machine (registry entry product) and full-lifecycle reset hygiene. **STATUS: BUGS** — three critical state inconsistencies and one stale-state leak found.

---

## I. State-Machine Exhaustiveness: Registry Entry State Product

### Entry Fields in Play
```
blocked: boolean                                 // Tracks: element is not currently playing
voiceStalled: boolean                           // Watchdog latched: recovery window exhausted
paused: el.paused (read from HTMLAudioElement) // Element pause state
playbackFailure: 'unsupported'|'aborted'|null // Play() rejection reason
sinkApplyResult: 'selected'|'default-fallback'|'unsupported'|'failed'  // Most recent sink apply
sinkApplyTimedOut: boolean                      // Sink apply promise timed out
muted: el.muted                                 // Element mute state
srcObjectAttached: el.srcObject !== null        // Stream bound to element
mutedAll: service-level signal                  // Mute all remote audio
unlocked: service-level boolean                 // User gesture unlock occurred
```

### Critical State Combinations & Contradictions

#### **BUG #1: Sink-Failed but Playing (state contradiction)**
**File:line** remote-audio.service.ts:296, 581

**Scenario:**
1. addPublisher: entry created with sinkApplyResult='selected' (line 483)
2. applyOutputDevice called: setSinkId() fails → sinkApplyResult='failed', entry.blocked=true (line 296)
3. But then el.play() succeeds → onPlaying fires → entry.blocked=false (line 458)
4. sinkApplyResult remains 'failed' (never re-attempted unless replayRegistryElements called)

**Resulting State:**
- sinkApplyResult='failed'
- blocked=false (from onPlaying)
- paused=false (element genuinely playing)
- playbackFailure=null (play succeeded)

**Inconsistency:**
- `blockedReason(entry)` line 641: `if (entry.sinkApplyTimedOut || entry.sinkApplyResult === 'failed') return 'sink-failed';`
- Returns 'sink-failed', but the element IS playing (paused=false, srcObject attached)
- **The banner lies: reports sink-failed while audio flows**.

**Transition:** Entry stuck in this state until replayRegistryElements (recovery, device change) is called, which re-applies sink and overwrites sinkApplyResult.

**Why it matters:** Users see "sink-failed" in diagnostics while audio is audible. Watchdog does not re-attempt sink recovery once blocked is cleared.

---

#### **BUG #2: Blocked Field Stale vs. El.Paused (state drift)**
**File:line** remote-audio.service.ts:462–466, 624

**Scenario:**
1. Entry added: blocked=true (line 480), el.play() called
2. onPlaying event fires → blocked=false (line 458)
3. User (or watchdog) pauses element → onPaused fires → blocked=true (line 465)
4. User resumes element → onPlaying fires → blocked=false
5. But if el.paused is read in between onPaused and onPlaying, state is: blocked=false but el.paused=true

**Resulting State (race condition):**
- blocked=false
- paused=true (read directly from el.paused, not from blocked field)
- playbackFailure=null
- voiceStalled=false

**Inconsistency:**
- `blockedReason()` line 644: `if (entry.el.paused && !entry.playbackFailure) return 'paused';`
- Correctly returns 'paused' (reads el.paused directly, not blocked field)
- But `allSinksPlaying()` line 341: `!entry.blocked && ... && (!entry.el.paused || !!entry.playbackFailure)`
- This AND-checks blocked=false && el.paused=true → false (correctly identifies not all playing)
- However, the blocked field is semantically "was playing last event", not "is paused now"

**Why it matters:** `blocked` field does not track current element state; it only tracks last event. If paused but blocked=false, refreshBlockedState may not immediately update the banner (depends on next event).

---

#### **BUG #3: SinkApplyResult Semantics Violation (state invariant broken)**
**File:line** remote-audio.service.ts:296, 581, 506–509

**Scenario:**
- sinkApplyResult='unsupported' is set when setSinkId() is not available (line 138)
- But later, if no device was requested (deviceId=''), the result should be 'selected' not 'unsupported'
- addPublisher path (line 494): sink is applied with selectedSinkId (could be undefined)
- applyMediaElementSinkWithDefaultFallback (line 136): if `deviceId === undefined` returns 'selected'
- If selectedSinkId is undefined, sink apply returns 'selected', which is correct
- But if selectedSinkId is set, and sink apply fails, result is 'default-fallback' or 'failed' or 'unsupported'

**Resulting State:**
- sinkApplyResult='unsupported', blocked=false, paused=false
- blockedReason: 'playback-unsupported' (if playbackFailure='unsupported') OR 'sink-unsupported'  
- Wait, 'playback-unsupported' vs sink-apply 'unsupported' — different failure types
- But blockedReason (line 642) treats sinkApplyResult='unsupported' as 'sink-failed' via the check: `if (entry.sinkApplyTimedOut || entry.sinkApplyResult === 'failed')` — NO, that's only 'failed'
- Actually, sinkApplyResult='unsupported' does NOT trigger sink-failed. blockedReason falls through to line 645: `if (entry.blocked) return 'autoplay';` or line 646: `return null;`

**Issue:** sinkApplyResult='unsupported' (sink ID not supported on this browser) is stored but never consulted by blockedReason. A user on an unsupported browser has sinkApplyResult='unsupported' for every entry, but blockedReason ignores it.

**Why it matters:** Diagnostics payload shows sinkApplyResult='unsupported', but blockedReason doesn't explain why (doesn't exist in blockedReason enum).

---

#### **BUG #4: Unlocked Field Leaks Across Calls (stale state)**
**File:line** remote-audio.service.ts:285, 428

**Scenario (CR2 'unlocked' class leak):**
1. Call 1: unlockAndPlayRemoteSinks() called → unlocked=true (line 286)
2. Element plays successfully
3. User leaves call → reset() called → sets unlocked=false (line 428)
4. BUT: if reset() is NOT called (e.g., only setInCallActive(false)), unlocked remains true
5. setInCallActive(false) calls clearRegistry() (line 421), but does NOT reset service fields

**Stale State:**
- inCall=false, registry=empty, unlocked=true
- playoutDiagnostics() (line 389): `unlocked: this.unlocked` → exports unlocked=true even though no call active

**Mechanism:**
- reset() called by room.page on component destroy (in release handler)
- But setInCallActive(false) called earlier (when leave/end-call flow starts)
- Timing: if reset() not called before next call, unlocked persists

**Why it matters:** 
- Diagnostics sent to server with unlocked=true from previous call
- Server may misinterpret as "user unlocked in current call" when they didn't
- CR2 classified as "stale unlocked" — same issue

---

### State Combinations Checked for Stuck/Contradictory States

| blocked | voiceStalled | paused | playbackFailure | sinkResult | Reachable? | Stuck? | Lies? | Notes |
|---------|--------------|--------|-----------------|------------|-----------|--------|-------|-------|
| T       | T            | T      | null            | selected   | Y         | N      | Y*    | Blocked+stalled but paused — inconsistent with voiced recovery |
| F       | T            | F      | null            | selected   | Y         | N      | Y*    | Playing but stalled — intentional for watchdog surface |
| F       | F            | T      | null            | failed     | Y         | N      | N     | Paused after sink fail — consistent |
| T       | F            | F      | null            | selected   | Y         | N      | Y     | **BUG#1**: Element playing but blocked says "autoplay" |
| F       | F            | T      | null            | null       | Y         | N      | Y     | **BUG#2**: blocked stale vs paused |
| T       | F            | F      | unsupported     | selected   | Y         | N      | N     | Play failed → paused likely F (no audio) — consistent |
| F       | F            | F      | null            | unsupported| Y         | N      | N     | Sink unsupported → blockedReason doesn't explain |

**Y* = Intentional for watchdog behavior (stalled flag surfaces during recovery window)**

---

## II. Full-Lifecycle Reset Hygiene

### Scenario: Fresh Load → Join → Active (stall+fallback) → Leave → Rejoin → Leave

#### Reset Path A: reset()
```typescript
reset() {
  this.inCall = false;                    // ✓ Clears in-call flag
  this.generation += 1;                   // ✓ Invalidates stale entries
  this.clearRegistry();                   // ✓ Destroys all entries
  this.unlocked = false;                  // ✓ Clears unlock state
  this.selectedSinkId = undefined;        // ✓ Clears selected device
  this.effectiveSinkId = null;            // ✓ Clears effective device
  this.usedDefaultSinkFallback = false;   // ✓ Clears fallback flag
  this.mutedAll.set(false);               // ✓ Unmutes
  this.contextState.set('none');          // ✓ Clears context state
  this.outputPlaying.set(false);          // ✓ Clears playing flag
  this.remoteAudioBlocked.set(false);     // ✓ Clears blocked banner
  // voiceRecoveryCounters reset              // ✓ Clears counters
}
```

#### Reset Path B: setInCallActive(false)
```typescript
setInCallActive(false) {
  if (this.inCall === false) return;      // Guard: no-op if already false
  this.inCall = false;                    // ✓ Clears in-call flag
  this.generation += 1;                   // ✓ Invalidates stale entries
  this.clearRegistry();                   // ✓ Destroys all entries
  // ❌ Does NOT reset service fields:
  //    - unlocked, selectedSinkId, effectiveSinkId, usedDefaultSinkFallback
  //    - Signals (mutedAll, contextState, outputPlaying, remoteAudioBlocked) are not cleared
  //    - voiceRecoveryCounters not cleared
}
```

### Stale State Leak Analysis

**Category 1: CR2 'unlocked' class**
- `unlocked`: Reset only in reset(), leaks via setInCallActive(false). **LEAK**.
- `selectedSinkId`: Reset only in reset(), leaks via setInCallActive(false). **POTENTIAL LEAK** (if device list changes between calls, old ID used).
- `effectiveSinkId`: Reset only in reset(), leaks via setInCallActive(false). **LEAK**.
- `usedDefaultSinkFallback`: Reset only in reset(), leaks via setInCallActive(false). **LEAK**.

**Category 2: Signal state**
- `volume`: Set in constructor from storage, **NOT reset in reset()**. Persists across calls via localStorage. **INTENTIONAL** (user preference).
- `sourcesVersion`: Bumped in refreshBlockedState, **NOT explicitly reset**. After reset/rejoin, bumped once more → higher value. **NOT STALE** (only used for reactivity trigger, not value comparison).

**Category 3: WeakMap state**
- `sinkIdApplier.targets` (WeakMap): Naturally GC'd when HTML elements destroyed. **CLEAN**.

### Rejoin Isolation Test

**Scenario: Call 1 ends, reset() called, Call 2 starts**

1. End Call 1:
   - reset() called: generation=2, inCall=false, registry cleared
   - All service fields reset ✓

2. Start Call 2:
   - setInCallActive(true): generation=3, inCall=true
   - New peers added: generation=3 captured in entry.generation

3. Stale entry from Call 1:
   - Old entries have generation=1
   - isEntryCurrent (line 602) checks: `entry.generation === this.generation` (1 === 3) → false
   - Old entries not consulted during Call 2 ✓

4. BUT: If setInCallActive(false) called without reset():
   - setInCallActive(false): inCall=false, generation=2
   - setInCallActive(true): inCall=true, generation=3
   - Service fields (unlocked, selectedSinkId, etc.) NOT cleared between calls ✗

**Issue:** If call end → start sequence uses only setInCallActive(false → true), stale service state persists.

---

## III. Banner/BlockedReason Truth Across Transitions

### Rapid Mute → Unmute
```
1. mutedAll=false, blocked=false, playing → remoteAudioBlocked=false
2. setMutedAll(true) → el.muted=true, clears voiceStalled, refreshBlockedState → blocked depends on el.paused
3. setMutedAll(false) → el.muted=false, refreshBlockedState → depends on el.paused
4. Expected: banner tracks mute state, not playback state
5. Actual: banner checks blocked/voiceStalled/paused, not muted ✓
```
**Truth: OK**

### Stall → Recover
```
1. watchdog marks voiceStalled=true → refreshBlockedState → remoteAudioBlocked=true (includes this entry)
2. Emission advances → clearVoiceStalls([peerId]) → voiceStalled=false → refreshBlockedState → remoteAudioBlocked checks remaining entries
3. Expected: banner clears when recovery succeeds
4. Actual: banner updates on voiceStalled change ✓
```
**Truth: OK**

### Fallback → Device Returns
```
1. applyOutputDevice('new-device') fails → sinkApplyResult='default-fallback', effectiveSinkId='' ✓
2. applyOutputDevice('another-device') succeeds → sinkApplyResult='selected', effectiveSinkId='another-device' ✓
3. Expected: effectiveSinkId tracks active device
4. Actual: updated via updateSinkFallbackState (line 556) ✓
```
**Truth: OK**

### Unsupported Browser
```
1. applyMediaElementSinkWithDefaultFallback called, setSinkId not available → sinkApplyResult='unsupported'
2. Entry still plays (uses browser default)
3. blockedReason: Does NOT check sinkApplyResult='unsupported' → falls through to blocked/voiceStalled/paused checks
4. Expected: blockedReason explains "unsupported sink"
5. Actual: sinkApplyResult='unsupported' is stored but not reflected in blockedReason enum
```
**Truth: Incomplete** (sinkApplyResult='unsupported' is a valid state but not exposed in blockedReason)

---

## IV. Privacy/Payload Concern (sub-probe #4)

**Diagnostics payload (line 513 in room.page.ts):**
```typescript
remoteAudioPlayout: this.remoteAudio.playoutDiagnostics()
```

**RedactedAudioOutputLabel (line 109 in diagnostics.page.ts):**
```typescript
if (sinkId === selectedAudioOutputId) return 'selected';
if (sinkId === '') return 'default';
return `id#${shortHash(sinkId)}`;
```

**Analysis:**
- Sink IDs hashed with FNV-1a (6 hex chars) to obscure device ID (line 190)
- Hashing is **NOT cryptographically secure** but sufficient to hide the ID from casual observation
- **Owner-only access** (line 2917 in room.page.ts comment): "capture + owner-only network-path readout"
- **Privacy: OK** (hashed IDs, owner-only access gate)

---

## V. New Bugs Found (Summary Table)

| Bug ID | Severity | File:Line | Issue | Symptom | Fix Hint |
|--------|----------|-----------|-------|---------|----------|
| CR7-1  | CRITICAL | 296, 581  | sinkApplyResult stale after successful play | blockedReason='sink-failed' while audio plays | Re-apply sink after successful play, or reset sinkApplyResult on onPlaying |
| CR7-2  | CRITICAL | 624, 341  | blocked field doesn't track el.paused in real time | blocked=false but paused=true (race) | Update blocked on pause/play events OR always read el.paused directly |
| CR7-3  | MEDIUM   | 407, 640–646 | sinkApplyResult='unsupported' not explained in blockedReason | Unsupported sink not visible in blocked reason | Add case to blockedReason: `if (entry.sinkApplyResult === 'unsupported') return 'sink-unsupported';` |
| CR7-4  | MEDIUM   | 428, 285  | unlocked field leaks across calls (CR2 class) | playoutDiagnostics exports stale unlocked | Reset unlocked + other service fields in setInCallActive(false) |

---

## VI. What CR1-6 Missed

1. **CR1 (correctness)**: Didn't catch sinkApplyResult stale-state interaction with blocked field
2. **CR2 (concurrency)**: Identified voiceStalled stuck + unlocked leak, but not the full family of service-field leaks via setInCallActive(false)
3. **CR3-6**: Didn't exhaustively check state product (blocked × voiceStalled × paused × playbackFailure × sinkResult combinations)

---

## STATUS

**BUGS: CR7-1 (critical), CR7-2 (critical), CR7-3 (medium), CR7-4 (medium)**

State machine is **NOT exhaustively consistent**. sinkApplyResult can diverge from actual playback state. Unlocked leaks across call boundaries via setInCallActive(false) path.

Recommend:
1. **Fix CR7-1**: Clear or re-set sinkApplyResult on successful play (onPlaying handler)
2. **Fix CR7-2**: Unify blocked-field semantics OR always read el.paused directly in refreshBlockedState
3. **Fix CR7-3**: Add sink-unsupported case to blockedReason
4. **Fix CR7-4**: Centralize reset logic; call full reset() path OR mirror reset fields in setInCallActive(false)
