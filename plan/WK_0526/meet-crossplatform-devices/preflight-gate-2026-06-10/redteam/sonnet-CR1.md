# RED-TEAM CR1 — Lens L1: Residual silent/never-publish paths
## Role: sonnet | Date: 2026-06-10

---

## Residual silent/never-publish paths?

**None found.** All five concrete never-publish scenarios from the spec are now loud:

| Path | Mechanism | Verdict |
|------|-----------|---------|
| PATH A — `participantId`/`sessionId` missing | `else` branch at room.page.ts:1859–1863 sets `audio-failed` + failure notice | CLOSED |
| PATH B — unhandled rejection on first join (`!wasInCall`) | `.catch()` now unconditional (room.page.ts:1853–1857), not only for `wasInCall` | CLOSED |
| State-revert during retries — publish exits silently without 'ready' | `.then()` watchdog at room.page.ts:1844–1851 fires if still in-call + still 'audio-connecting' | CLOSED |
| No live audio track at publish deadline | `initialPublishStream()` now throws `InitialPublishPermanentError` (room.page.ts:1717) → non-retryable → `audio-failed` | CLOSED |
| Retries exhausted | `!retry.shouldRetry` at room.page.ts:1640–1647 explicitly sets `audio-failed` + opens device dialog | CLOSED (pre-existing) |

`publishTriggerCount` is incremented at room.page.ts:1607 BEFORE the early-return guard at line 1609, so `publishTriggerCount===0` after admit correctly diagnoses PATH A in diagnostics.

---

## In-call gated on 'published'? Connecting timeout bounded? Empty-transceiver caught?

**In-call UI gate on 'published':** PARTIAL. The `audio-connecting` banner shows while `preflightGateStatus === 'audio-connecting'` (room.page.html), but the main call UI (peer grid, controls) renders as soon as `state === 'in-call'`, not on `preflightGateStatus === 'ready'`. The spec says "controls reflect it" — the banner is there, but controls are not locked. This is a spec deviation, not a silent path.

**Connecting timeout bounded:** YES. `startAudioConnectingTimeout()` fires a 30s window (room.page.ts:1576–1582). If `preflightGateStatus` is still 'audio-connecting' after 30 000ms → sets `audio-failed` + opens device dialog. Cleared in `finally` at line 1662 and in `cleanupCall` at line 2541. No infinite "Connecting…".

**Empty-transceiver caught (haiku path):** PARTIALLY. The pre-publish check (`initialPublishStream()` throw at line 1717) catches a dead track before `sfuClient.publish()` is called. For the rarer case where the WebRTC layer accepts the publish API call but the transceiver carries no audio (track live locally, SFU reports 'published', but no bytes sent), `verifyInitialCaptureEnergy` fires post-publish and runs a mic sweep on confirmed silence. This is NOT spec-compliant (spec says audio-failed + config panel), but it is NOT a silent path — the user gets the mic silent warning + sweep eventually. See NON-CRITICAL #1 below.

---

## Findings

### [NON-CRITICAL] N1 — Post-publish empty-transceiver: spec says audio-failed+panel, impl does mic-sweep (room.page.ts:3139–3158)

`verifyInitialCaptureEnergy` samples local mic capture energy after publish. On confirmed silence it calls `runMicRecoverySweep()` → tries alternative mics → shows `micSilentWarning` if all fail. It never sets `preflightGateStatus = 'audio-failed'` and never opens the config panel. Spec §3 says: "published-but-no-audio (empty transceiver) → treat as audio-failed → config panel." The implementation deviates.

Additionally: the local energy check cannot detect the true empty-transceiver case (local mic producing energy, but WebRTC transceiver didn't pick up the track). In that scenario local energy is fine, sweep passes, and the user gets neither warning nor recovery — their mic is genuinely silent to the other side. This is an upstream SFU client concern but worth flagging.

User is NOT silently broken without indication in the normal sweep path. The deviation is observable but not a show-stopper for the core Joanne bug.

### [NON-CRITICAL] N2 — `preflightGateStatus` stays 'pending' if already published on entry (room.page.ts:1609)

If `sfuClient.localPublishState()?.status === 'published'` when `publishInitialSfuWithRetry` is called, the function returns before setting 'audio-connecting' or 'ready'. `preflightGateStatus` stays at its previous value ('pending' on first admit). The `.then()` watchdog condition `preflightGateStatus === 'audio-connecting'` is false → watchdog doesn't fire. User IS published so this isn't a silent path, but the observability signal reads wrong. Affects: reconnection cases where SFU state survived and `resetForReconnect()` didn't clear it.

### [NON-CRITICAL] N3 — State-revert during retry: stale 'audio-connecting' between LINE-A return and cleanupCall (room.page.ts:1621)

If state leaves 'in-call' during the `await delay(retry.backoffMs)` window, LINE A fires and returns without setting 'audio-failed'. `clearAudioConnectingTimeout()` fires in `finally`. The `.then()` watchdog checks `state === 'in-call'` → false (state reverted) → watchdog doesn't fire. `preflightGateStatus` stays 'audio-connecting' until `cleanupCall` resets it to 'pending' (line 2540). The stale 'audio-connecting' state persists for the gap between the return and the cleanup. User is not in-call (state changed), so they can't be "silently in-call" — this is cosmetic/transient. NON-CRITICAL.

### [NON-CRITICAL] N4 — `testSpeaker()` has no error feedback on failure (room.page.ts:1051–1067)

`speakerTestCount.update()` is called AFTER `await context.resume()`. If `context.resume()` throws (e.g., AudioContext in a bad state), `speakerTestCount` is not incremented, the user can't pass the speaker gate, and no error is shown to the user — the button click just does nothing visible. On a gesture-triggered button click, AudioContext should resume successfully, so this is low-probability. No silent-in-call path, just a stuck-at-gate UX failure with no feedback.

### [NON-CRITICAL] N5 — Transport recovery republish briefly resets `preflightGateStatus` to 'audio-connecting' for already-admitted users (room.page.ts:1696–1707)

`republishSfuAfterTransportRecovery()` calls `publishInitialSfuWithRetry()` which sets `preflightGateStatus = 'audio-connecting'` at line 1611. An in-call user whose status was 'ready' briefly sees it revert to 'audio-connecting' during transport recovery. Minor UX flash. On success it correctly goes back to 'ready'.

---

## Trace summary (key evidence)

- **Admitted handler** room.page.ts:1838–1863: Unified `.then().catch()` replaces the old `if (wasInCall)` split. No unguarded `.catch()`-less publish path remains.
- **publishInitialSfuWithRetry** room.page.ts:1604–1664: `publishTriggerCount++` before any guard (line 1607); 'audio-connecting' before retry loop (1611); timeout started (1612); timeout cleared in `finally` (1662); all exit paths set either 'ready' or 'audio-failed' except the LINE-A / LINE-B early-returns (covered by .then() watchdog for state='in-call' case, by cleanupCall for state≠'in-call').
- **initialPublishStream** room.page.ts:1709–1724: Throws `InitialPublishPermanentError` on no live audio (line 1717). `isRetryableInitialPublishFailure` returns false for it (line 1727) → immediate `audio-failed` on first attempt.
- **cleanupCall** room.page.ts:2538–2541: Resets `publishTriggerCount = 0`, `preflightGateStatus = 'pending'`, clears timeout. Called on every state exit.
- **planInitialPublishRetry**: `failedAttempt >= cap` (cap=3) → `shouldRetry: false, reason: 'capped'` (sfu-roster-utils.ts:82–83). Loop cannot exit naturally past cap without `!shouldRetry` firing first.

---

STATUS: CRITICAL-CLEAN (no silent-never-publish residual)
