# RED-TEAM CR2 — HAIKU ASSESSMENT

## Gate hard-block correct + no false-block? (file:line)

**Hard-block CORRECT:**
- `missingJoinPrereqs()` (room.page.ts:2362) correctly blocks join until:
  - `hasMicAccess` = true (audio track live)
  - `micVerified` = `lobbySelfTestFlag()` (classifyMicCapture detected energy)
  - `speakerTested` = `speakerTestCount() > 0` (clicked test)
- `missingPreflightPrereqs()` (room-decisions.ts:279) enforces both mic + speaker before 'ready' gate unlocks
- Camera correctly optional ✓
- `onPreflightConfirm()` (room.page.ts:411) only fires when `confirmReady=true`, which requires BOTH flags

**False-block risk — MOSTLY SAFE but one vector:**
- `classifyMicCapture()` (mic-energy.ts:161) is **well-designed**: checks BOTH energy-delta (must be increasing) AND max-level corroboration before claiming silence. Prevents false-negative on quiet-but-working mics ✓
- **BUT:** `lobbySelfTestFlag` is set once energy detected and **NEVER reverts** while in lobby (unless mic disabled) — line 3527. Once user talks, flag stays true. Correct behavior for gate ✓

**FALSE-BLOCK CRITICAL**: User mistakenly passes speaker gate on iOS/no-speaker:
- `testSpeaker()` (room.page.ts:1052) creates oscillator + calls `context.resume()` then `oscillator.start()`
- **Line 1063:** `this.speakerTestCount.update((n) => n + 1)` fires IMMEDIATELY after start(), with **zero verification** that sound played
- On iOS with autoplay policy blocking (`AudioContext` suspended until user gesture): `context.resume()` succeeds (just unfreezes the context), but `oscillator.start()` emits silently to suspended/blocked context. **No error thrown.** Counter increments anyway.
- On system with no audio output device: oscillator creates but destination is mute. Counter increments.
- **Result:** User clicks button once, hears nothing, thinks test failed or doesn't know. Can retry clicking, but EACH click increments counter. Once count > 0 + mic verified = gate unlocks.
- **Attack:** User on iOS clicks "Test speaker" in lobby, no sound due to autoplay block, doesn't know test failed, mic is fine (e.g., was already verified from prior chatter), clicks "Confirm — everything works". Joins call. **Expects to hear remote audio but hears nothing because speaker gate was bypassed.**

---

## Config panel recovers (no dead-end)? Persistence holds?

**CONFIG PANEL CORRECT:**
- Dialog opens (confirmGate=true) with hints:
  - "Test your speaker above before joining" (if speaker not tested)
  - "Talk now — we need to hear your mic before joining" (if mic not verified)
- Device dropdowns + speaker test button present ✓
- Confirm button disabled until `confirmReady()` = `lobbySelfTestFlag() && speakerTestCount() > 0` ✓

**Device switch RE-VALIDATION CORRECT:**
- `changeAudioDevice()` (room.page.ts:985) clears `lobbySelfTestFlag` and calls `reacquireLobbyStream()`
- This restarts `startLobbySelfTest()` with a NEW energy window on the new device ✓
- New device is re-validated before user can confirm ✓

**PERSISTENCE (R8) FIX CORRECT:**
- `fallbackChosenIdForAudioSync()` (room-decisions.ts:247) preserves `requestedDeviceId` when track reports generic id ('default') instead of returning '' ✓
- Fixes regression where reload after device selection would snap back to default ✓
- Tests verify all paths (generic id, exact match, empty track id) ✓

**PERSISTENCE ISSUE — SPEAKER TEST COUNTER:**
- `speakerTestCount` is NOT reset when user changes audio OUTPUT device (changeAudioOutputDevice, line 1030)
- User tests speaker (device A) → count=1, closes dialog, reopens dialog, switches to device B
- speakerTestCount still > 0 even though they never tested device B
- Gate shows "speaker tested" hint but user only tested different device
- **POTENTIAL CRITICAL:** User joins call assuming built-in speaker was verified when they only tested 3.5mm jack (now unplugged)
- **Mitigating:** User would click "Test speaker" again on new device and hear nothing, might retry. But gate UI doesn't make it clear they should re-test after switching devices.

---

## Findings [CRITICAL]/[NON-CRITICAL]

### [CRITICAL-BUG L2.1] Speaker test bypass on iOS + autoplay block / no speaker
**Vector:** Can a user bypass the gate and join with unverified speaker?
**Evidence:** 
- testSpeaker() line 1052-1068: increments counter at line 1063 with NO try-catch, NO error handler, NO verification that sound was heard
- iOS autoplay policy: AudioContext.resume() succeeds but oscillator.start() is silent on suspended context — no exception
- System with no speaker: oscillator creates but destination is mute/disabled
**Impact:** User joins call expecting to hear remote audio but hears nothing. No remote audio feedback.
**Root:** No post-test verification (e.g., loopback sample, timeout guard, error handler).
**Severity:** CRITICAL — affects usability on iOS and audio-less systems.

### [CRITICAL-BUG L2.2] Speaker test silently fails on error
**Vector:** Can testSpeaker() throw and break the dialog?
**Evidence:** room.page.ts:1052-1068 — createOscillator, context.resume, oscillator.start have no error handling. If createOscillator fails (rare but possible), exception propagates uncaught.
**Impact:** Dialog could break mid-test, user stuck in broken state.
**Severity:** CRITICAL (lower probability but catastrophic when it happens).

### [NON-CRITICAL] Speaker test counter doesn't reset on device switch
**Vector:** User thinks they verified new speaker when they only tested old one.
**Evidence:** changeAudioOutputDevice (line 1030) does NOT reset speakerTestCount. Device switch UI doesn't hint that speaker test is device-specific.
**Impact:** User might join call expecting built-in speaker to work when they only tested 3.5mm jack (now absent).
**Mitigation:** Likely caught on first call (no audio heard), user returns to device dialog and re-tests.
**Severity:** NON-CRITICAL but UX debt.

### [NON-CRITICAL] Mic classifier threshold accuracy
**Vector:** False-negative on quiet-but-working mic if threshold is too high.
**Evidence:** classifyMicCapture (mic-energy.ts:166) uses `MIC_SILENCE_LEVEL_THRESHOLD` constant (not visible in patch, need verification).
**Impact:** Good user wrongly blocked if speaking quietly.
**Severity:** LOW — algorithm is well-designed to avoid this via energy-delta check; even flat quiet signal counts as "working" if energy is increasing.

---

## Summary

**Gate hard-block:** ✓ Correct. Cannot bypass (both flags required, button disabled until both true).

**False-block:** ✗ Major hole. Speaker test on iOS/no-speaker is a **click-counter**, not a verification. User can pass gate without hearing anything. Mic classifier is sound.

**Config panel:** ✓ Mostly correct. Re-validation on device switch works. Speaker test counter persistence is a UX bug but not a gate-bypass vector.

**Persistence:** ✓ R8 fallback fix is correct. Counter reset on device switch is missing but not critical.

---

## STATUS: **CRITICAL-BUG**

**Worst case:** User on iOS (autoplay blocked) + working mic joins call expecting to hear remote audio, but hears nothing because speaker test was silent and gate was bypassed by a button click. User is stranded in call with no audio feedback.

**Recommended fix:**
1. testSpeaker() should wrap createOscillator + start in try-catch (L2.2 error handling).
2. testSpeaker() should measure loopback energy (or at least verify oscillator emitted some audio bytes) before incrementing counter (L2.1 bypass).
3. Reset speakerTestCount when user switches audio output device (L2 UX).

**Blocked on:** L2.1 (gate bypass) makes this CRITICAL until fixed.
