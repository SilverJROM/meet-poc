# RED-TEAM CR4 — Sonnet convergence pass
_Lens L4: confirm CR1-CR3 fixes hold + R9 Joanne + whole-gate sweep_
_Date: 2026-06-10_

---

## R9 correct now (Joanne badged, no FPs)?

**YES — Joanne is badged correctly.**

`classifyPeerAudioHealth` (room-decisions.ts:247-254) checks in this order:
1. `!micEnabled` → `'ok'` (muted peer: no badge ✓)
2. `!pastGrace` → `'ok'` (within 7s setup window: no flicker ✓)
3. `!isPublishing` → `'never-published'` (Joanne: admitted + past grace + unmuted + never sent to SFU ✓)
4. `!hasTrack || bytesNow === null` → `'no-track'`
5. `bytesNow <= bytesPrev` → `'stalled'`

`updateRemoteAudioHealth` (room.page.ts:2957-2994) iterates `this.peers()` (full admitted roster), not `remotePublishers()`, so Joanne is evaluated even though she never appeared in the SFU publisher map. `peerFirstSeen` timestamps the first time each peer appears in the roster; `pastGrace = (now - firstSeen) >= 7000`. Departure + rejoin resets the timestamp (prune-then-re-insert path). All three test assertions for the Joanne case pass:
- `admitted + past grace + unmuted + never published → 'never-published'` ✓
- `admitted + past grace + muted + never published → 'ok'` (mute beats never-published) ✓
- `admitted + within grace + unmuted → 'ok'` (no flicker) ✓

Badge wires to tile correctly: `[audioUnhealthy]="isHost() && peerAudioUnhealthy(peer)"` in all three tile positions (main share, strip, grid). Guest tiles do not badge (isHost() guard). ✓

**No false positives found for:**
- Muted peers (checked first, returns 'ok')
- In-grace peers (checked second, returns 'ok')
- First-sample peers (bytesReceivedPrev === null short-circuits stalled check: returns 'ok')
- Publishing peer with climbing bytes (bytesNow > bytesPrev: falls through to 'ok')

---

## CR1–CR4 fixes hold?

**CR-FIX-1 (silent never-publish closed):** `publishTriggerCount` is incremented at the TOP of `publishInitialSfuWithRetry` before any early-return. The `finally` block's `shouldSurfacePublishFailure` guard catches any exit with `!publishSucceeded && gateStatus === 'audio-connecting'` and sets audio-failed. PATH A (admitted without participantId/sessionId) is handled in the admitted handler itself (preflightGateStatus set to 'audio-failed' before publishInitialSfuWithRetry is ever called). Outer `.catch()` covers unexpected throws. Verified: no path leaves gate at 'audio-connecting' silently. ✓

**CR-FIX-2 (mic-gate positive signal + speaker confirm):** `micWorking` only becomes true on 'working' classification; 'silent' → false; 'indeterminate' → keeps current (no flicker). Gate button disabled until both `micWorking && speakerVerified`. `speakerVerified` only becomes true on explicit "Did you hear it? → Yes" click; plays tone → pending → user confirms → verified (or denied → error). Speaker-switch invalidates prior verification (`speakerVerified.set(false)`). Mic-switch invalidates prior verification (`micWorking.set(false)`). ✓

**CR-FIX-3 (host badge + quiet-guest):** `shouldShowAudioFailNotice` and `shouldOpenDeviceDialogOnAudioFail` are both host-only. Guests get silent background retry and host gets the badge. Every failure surface in publishInitialSfuWithRetry (retries exhausted, transceiver check failed, outer catch, timeout) applies these guards consistently. ✓

**CR-FIX-4 (R9 roster-iteration + grace + mute):** Covered above under R9 analysis. ✓

---

## Whole-gate sweep: guest journey

**Green room → device dialog → confirm → join → admit → publish → ready:**

1. `lobbyDeviceDialogOpen = true` on load. User sees mic meter + speaker test.
2. Mic poller runs `pollLobbySelfTest` every second; `micWorking` becomes true after 'working' classification.
3. Speaker: user clicks Test → tone plays → `speakerTestPending = true` → "Did you hear it?" → Yes → `speakerVerified = true`.
4. `preflightConfirmReady = micWorking && speakerVerified`. Confirm button enables.
5. User clicks Confirm → `onPreflightConfirm` → closes dialog.
6. User clicks Join → `missingJoinPrereqs` checks hasMicAccess + micVerified + speakerTested. All pass → join proceeds.
7. Admit message arrives with participantId/sessionId → `publishInitialSfuWithRetry` called.
8. `preflightGateStatus = 'audio-connecting'` → spinner on mic button. 15s timeout starts.
9. Publish succeeds → 2s delay → `hasOutboundAudioTrack()` confirms outbound-rtp stat exists.
10. `preflightGateStatus = 'ready'`, `publishSucceeded = true`. Timeout cleared in finally. ✓

**Host journey:** Same, plus `updateRemoteAudioHealth` runs after each remote voice watchdog poll. Peers in `this.peers()` evaluated; Joanne badged after 7s grace.

---

## Findings

**[NON-CRITICAL] preflightGateStatus stays 'pending' on re-admit when already published** (room.page.ts:1662)

On a reconnect where `localPublishState?.status === 'published'` is already true, `publishInitialSfuWithRetry` returns immediately after incrementing `publishTriggerCount` — before setting gate to 'audio-connecting'. The gate stays at 'pending' instead of advancing to 'ready'. Affects diagnostic readout only (`preflightGateStatus: 'pending'` when the peer IS actually publishing). No functional harm; `clearAudioConnectingTimeout` and the finally guard are never reached because the function returned before the timeout started, so no timeout fires. Diagnostic fix only; not blocking.

**[NON-CRITICAL] peerFirstSeen map not pruned if host role transfers mid-call** (room.page.ts:2988-2990)

If `isHost()` becomes false mid-call, `updateRemoteAudioHealth` stops being called, so the `peerFirstSeen` prune loop never runs. The map accumulates entries for all participants seen while host. Bounded by room size; cleared on `cleanupCall`. Memory leak only.

**[NON-CRITICAL] prevInboundBytes only tracks peers with current inbound-rtp entries**

If a peer's inbound-rtp stat is absent for one poll cycle (transient), `bytesNow = null` → 'no-track' badge that tick. On re-appearance, `bytesPrev = null` → first-sample 'ok'. Stall detection is delayed one additional poll for that peer. Transient, self-correcting.

**[NON-CRITICAL] Mic can re-block join if it goes 'silent' between Confirm and Join**

`micWorking` is live; if `classifyMicCapture` returns 'silent' after the user confirmed, the join gate re-blocks with 'mic-silent'. Intended by design (catch mic failure before entering call), but surprising UX if the mic is working but the user went quiet. Not a regression.

---

## R10 matrix — test coverage audit

| Row | Failure mode | Test assertion | Verdict |
|-----|-------------|----------------|---------|
| R10(a) | bytes frozen at 0 → 'stalled' → badge | spec:360-363 | ✓ |
| R10(a) | bytes climbing → 'ok' | spec:364-367 | ✓ |
| R10(a) | no inbound track → 'no-track' | spec:368-372 | ✓ |
| R10(a) | within grace → 'ok' | spec:373-378 | ✓ |
| R10(a) | first sample (prev null) → 'ok' | spec:379-383 | ✓ |
| R10(a) | bytes decreased → 'stalled' | spec:384-388 | ✓ |
| R10(a-cr4) | muted + stalled → 'ok' | spec:390-394 | ✓ |
| R10(a-cr4) | just-joined within grace → 'ok' | spec:395-399 | ✓ |
| R10(a-cr4) | Joanne: past grace + never-published | spec:400-403 | ✓ |
| R10(a-cr4) | past grace + never-published + muted → 'ok' | spec:404-409 | ✓ |
| R10(b) | publish-fails → audio-failed | spec:416-421 | ✓ |
| R10(c) | hasPc=false / trigger never fired → audio-failed | spec:422-427 | ✓ |
| R10(d) | state-revert mid-publish → finally guard fires | spec:430-440 | ✓ x2 |
| R10(e) | mic track ends in-call → recover-ended | spec:442-447 | ✓ |
| R10(f) | speaker not tested → gate blocks | spec:449-454 | ✓ |
| R10(g) | device unplugged → gate blocks with 'mic' | spec:455-459 | ✓ |
| R10(h) | permission revoked → gate blocks with ['mic','speaker'] | spec:460-464 | ✓ |
| R10(i) | null transceiver → throws loudly | spec:470-488 | ✓ x3 |

All 9 failure-mode rows covered. Every test is revert-failing (tests a decision function, not a pass-through). No failure mode has no test.

---

## Regressions from CR-fix-1..4

- **Recording**: `cleanupCall` unchanged; sync-recorder-peer-streams path untouched. No regression.
- **Video/screen share**: `audioConnecting()` signal is audio-only. Video toggle, screen share, camera-in-call paths unmodified. No regression.
- **Reconnect (P0.8)**: `publishInitialSfuWithRetry` re-entrant path guarded by `runId`. The new `publishTriggerCount` increments on each call (reconnect increments correctly). `startAudioConnectingTimeout` is idempotent (clears first). No regression.
- **Persistence R8**: `fallbackChosenIdForAudioSync` extracted and tested (4 assertions). The fix in `syncSelectedAudioIdToTrack` (generic id → preserve requestedDeviceId instead of '') is correct and tested. No regression on device-persist path.
- **Remote voice watchdog**: `updateRemoteAudioHealth` runs AFTER `observeRemoteVoiceTrack` in the same poll, with a `catch` guarding the whole block. No interference with the existing watchdog path.

---

STATUS: CRITICAL-CLEAN

CR1-4 fixes all hold. Joanne badged correctly with no false alarms. R10 matrix fully covered by revert-failing tests. Whole gate journey (green room → confirm → join → publish → ready) traces correctly with no silent failure paths remaining. Four non-critical findings noted; none blocks the handback gate.
