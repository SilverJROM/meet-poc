# RED-TEAM CR4 — CONVERGENCE GATE (Haiku Model 4.5)

**Role:** Independent red-team validator. This is the gate.
**Date:** 2026-06-10 · **Time:** ~05:00 UTC
**Scope:** Verify all CR1-3 fixes hold + R9 now catches Joanne correctly + no false-alarms + whole-gate final sweep for CRITICAL gaps.

---

## CRITICAL FINDINGS

### ✅ R9 CLASSIFICATION: CORRECT

**Joanne case (admitted + past grace + never published + unmuted):**
- `classifyPeerAudioHealth()` correctly returns `'never-published'` → host badge fired
- Trace: room-decisions.ts:247–254; updateRemoteAudioHealth() at room.page.ts:2957–2995

**No false positives:**
- Muted peers: `!micEnabled → 'ok'` (no badge even if stalled) ✓
- Within-grace peers: `!pastGrace → 'ok'` (no flicker) ✓
- Healthy peers: climbing bytes → `'ok'` ✓
- Stalled (bytes ≤ prev): `'stalled'` badge ✓
- No-track: `'no-track'` badge ✓

**Grace period:** Correctly hardcoded to `PEER_AUDIO_GRACE_MS = 7_000` (line 750).

**Roster coverage:** Iterates full admitted peer roster (`this.peers()`), not just `remotePublishers()` — Joanne peers are evaluated. Line 2968.

**Cleanup:** Departed peers pruned from `peerFirstSeen` map (lines 2989–2991). No memory leak.

---

### ✅ CR-FIX-1: PUBLISH FINALLY-BLOCK GUARD HOLDS

**State-revert path:** When a guest is admitted but state reverts to 'waiting-room' mid-publish:
- Gate stuck at `'audio-connecting'` with `publishSucceeded = false`
- `shouldSurfacePublishFailure()` returns `true` → finally block sets `'audio-failed'` ✓
- Trace: room.page.ts:1749; room-decisions.ts:230–232

**PATH A guard (hasPc=false / never-published):**
- `publishTriggerCount` incremented at TOP of `publishInitialSfuWithRetry()` (line 1660) — detects if trigger never fired
- If trigger never fired: `publishTriggerCount === 0` after admit → PATH A is logged, gate set to `'audio-failed'` ✓
- Trace: derivePublishGateStatus() at room-decisions.ts:178–183

**Double-set prevention:** Precheck on `gateStatus === 'audio-connecting'` ensures inner loop's prior `'audio-failed'` setting is not overwritten. ✓

---

### ✅ CR-FIX-2: SPEAKER GATE REQUIRES EXPLICIT CONFIRM

**Speaker test flow:**
1. User clicks "Test speaker" → `testSpeaker()` plays 440Hz tone (1s)
2. Sets `speakerTestPending = true` (line 1098)
3. Device-dialog shows "Did you hear it? [Yes] [No]" prompt (device-dialog.component.html:100–106)
4. User clicks "Yes" → `confirmSpeakerHeard()` sets `speakerVerified = true` (line 1105)
5. User clicks "No" → `speakerNotHeard()` sets `speakerVerified = false` (line 1112)

**Gate signal:** `preflightConfirmReady = micWorking() && speakerVerified()` (line 270).
- Confirm button disabled until BOTH are true.
- Speaking into mic for energy → `micWorking = true` (line 1238).
- Hearing tone + clicking Yes → `speakerVerified = true` (line 1105).

**No false pass:** Clicking "Test speaker" alone does NOT pass the gate. Must explicitly confirm. ✓

**Switching speaker:** When audio-output device changes (line 1053), `speakerVerified` and `speakerTestPending` reset to `false`. User must re-test. ✓

---

### ✅ CR-FIX-3: HOST BADGE + QUIET GUESTS

**Host sees badge:**
- Template passes `[audioUnhealthy]="isHost() && peerAudioUnhealthy(peer)"` to tiles (room.page.html:266, 281, 304)
- Tile shows "No audio" label only when `audioUnhealthy() && !peer().isLocal` (tile.component.html:35)
- Host can see all unhealthy peers per-participant during testing ✓

**Guest stays quiet:**
- `shouldOpenDeviceDialogOnAudioFail({ isHost: false })` → returns `false` — no device dialog popup ✓
- `shouldShowAudioFailNotice({ isHost: false })` → returns `false` — no technical error text ✓
- Guest experiences silent retry / recovery in background ✓

**No double-blindness:** If guest's audio fails mid-call, host sees the badge + diagnostics logged. Guest is not also seeing an error popup; they're quietly retrying. ✓

---

### ✅ CR-FIX-4: MUTE-AWARENESS + GRACE + ROSTER ITERATION

**Mute takes priority:** When peer is muted (`micEnabled = false`), classification returns `'ok'` regardless of bytes state. No badge. ✓

**Grace suppresses flicker:** Peers within 7s of admission (`!pastGrace`) always classified as `'ok'`, even if no track / no bytes yet. ✓

**Roster iteration:** `updateRemoteAudioHealth()` iterates `this.peers()`, the full admitted roster. Joanne (admitted but never published) is evaluated. ✓

---

### ✅ R8: DEVICE PERSISTENCE FIX

**Regression fixed:** When a user selects a non-default mic (e.g., "USB Mic") and reloads the page:
- OLD: Track reports generic id `'default'` → fallback was `''` → device snapped back to stored default ✗
- NEW: fallback is now `requestedDeviceId` (line 2780) → "USB Mic" persists ✓

**Trace:** fallbackChosenIdForAudioSync() in room-decisions.ts (lines 160–167).

**Applied:** In syncSelectedAudioIdToTrack(), line 2780 implements the exact logic.

---

### ✅ R10 MATRIX: FAILURE-MODE COVERAGE

Verified all 9 failure-mode rows have tests (room-decisions.spec.ts):

| Row | Failure Mode | Test Case | Verdict |
|-----|--------------|-----------|---------|
| R10(a) | audio-not-reaching-server (bytes stuck at 0) | bytesReceivedNow=0, bytesReceivedPrev=0 → stalled | ✓ |
| R10(b) | publish-fails (retries exhausted) | publishFailed=true → audio-failed | ✓ |
| R10(c) | hasPc=false (trigger never fires) | triggerFired=false → audio-failed | ✓ |
| R10(d) | state-revert mid-publish | stateReverted=true → audio-failed + shouldSurfacePublishFailure guard | ✓ |
| R10(e) | mic-dies mid-call (track ended) | event='ended' → recover-ended | ✓ |
| R10(f) | speaker-dead (untested) | speakerTested=false → gate blocks [speaker] | ✓ |
| R10(g) | device-unplugged (mic missing) | hasMicAccess=false → gate blocks [mic] | ✓ |
| R10(h) | permission-revoked | hasMicAccess=false, speakerTested=false → blocks [mic, speaker] | ✓ |
| R10(i) | empty-transceiver | requireLiveTransceiver(null) throws loudly | ✓ |

All rows covered. No failure mode left silent. ✓

---

## WHOLE-GATE SWEEP: GUEST JOURNEY

**Green room → mic verify → speaker verify → join → admit → publish → ready**

1. **Lobby (green room):** Device dialog shows mic meter + speaker test + camera preview ✓
2. **Mic verify:** classifyMicCapture → 'working' sets `micWorking = true` → gate unblocks mic prereq ✓
3. **Speaker verify:** User clicks "Test speaker", confirms "Yes" → `speakerVerified = true` → gate unblocks speaker prereq ✓
4. **Join attempt:** missingPreflightPrereqs() checks hasMicAccess + micVerified + speakerTested; all pass → join allowed ✓
5. **Post-admit:** publishInitialSfuWithRetry() fires with 3 retries; 2s post-publish transceiver check; gate set to 'audio-connecting' ✓
6. **Success:** Outbound-rtp stat exists → gate set to 'ready', guest is live ✓
7. **Failure:** Retries exhausted | transceiver absent | state-revert → finally guard fires → gate set to 'audio-failed' + shouldShowAudioFailNotice / shouldOpenDeviceDialogOnAudioFail respected ✓

**No blocking of good users. No undetected bad users. No silent failures.** ✓

---

## WHOLE-GATE SWEEP: HOST JOURNEY

1. **Pre-join:** Same as guest (mic + speaker required). ✓
2. **In-call:** Listens to remote audio streams; watchdog samples every 1.5s. ✓
3. **Badge detection:** updateRemoteAudioHealth() evaluates all admitted peers; classifyPeerAudioHealth() fires badges for stalled / no-track / never-published (Joanne case). ✓
4. **Host visibility:** Tiles show "No audio" badge for unhealthy peers (host-only). ✓
5. **Diagnostics:** All events logged to diagnostics (publishTriggerCount, preflightGateStatus, peers, etc.) ✓

---

## REGRESSIONS CHECK

**Recording:** Untouched in patch. recorder.notifyParticipantJoined() still fires on peer-joined. No regression. ✓

**Video:** Untouched in patch. Camera device selection, video track subscription, screen-share logic all unchanged. No regression. ✓

**Reconnect:** Untouched in patch. Reconnect message handling in sync logic (room.page.ts lines 1900–1965) unchanged. No regression. ✓

**Adjacent audio:** 
- remoteAudio.playoutDiagnostics() still logged ✓
- remote voice watchdog (observeRemoteVoiceTrack) still runs ✓
- local track failure recovery still fires ✓

---

## SUMMARY

| Category | Verdict |
|----------|---------|
| **R9: Joanne badged?** | ✅ Yes, correctly |
| **R9: No FPs?** | ✅ Muted, within-grace, healthy all correct |
| **CR-FIX-1: Publish guard?** | ✅ Finally block + shouldSurfacePublishFailure correct |
| **CR-FIX-2: Speaker confirm?** | ✅ Explicit "Did you hear it?" required |
| **CR-FIX-3: Host badge?** | ✅ Displayed on tiles, host-only |
| **CR-FIX-4: Mute-aware?** | ✅ Mute suppresses badge |
| **R8: Persistence?** | ✅ requestedDeviceId preserves selection |
| **R10: Matrix covered?** | ✅ All 9 rows tested |
| **No regressions?** | ✅ Recording, video, reconnect untouched |
| **No double-blindness?** | ✅ Host sees badges; guests silent-retry |

---

**STATUS: CRITICAL-CLEAN**

All CR1-3 fixes verified in place. R9 correctly catches Joanne without false-alarms. Whole-gate sweep finds no remaining CRITICAL gaps. Code is ready for preflight-gate release.

**Red-team sign-off:** Tried to break it. Found nothing. Gate holds.

---

*Report: haiku-CR4.md · Gate: PASS · Ready for QA hand-off*
