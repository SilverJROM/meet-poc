# Batch B2b — Changes

## User Report (verbatim)

"Recovery can escalate from retry to renegotiation to full SFU rejoin (fresh cfSessionId) when
lower-cost recovery fails ... does NOT terminally give up while admitted and audio advertised ...
Diagnostics record each recovery step + outcome." + north-star: "The UI must clearly report
unrecovered audio failure and offer an actionable recovery. Silent failure is not acceptable."
(R2, rung-3/rung-4 portion — B2a already shipped rungs 1-2 + the low-frequency never-give-up
continuation + the `needs-rejoin`/`throttled` markers this batch consumes.)

## Root Cause (mechanism, per B0 consensus)

B2a's rung-2 exhaustion emitted a `needs-rejoin` diagnostics marker and armed a bounded ~30s
same-session low-frequency retry, but **nothing ever consumed `needs-rejoin` to actually rotate the
local SFU session** — same-session retries alone cannot recover a genuinely poisoned/stale local
transport or CF session. There was also no visible UI signal once escalation reached this point; a
user stuck past rung-2 saw nothing but a console warning, violating the north-star's "silent failure
is not acceptable."

## Design decision: reuse the existing full-republish path, don't reinvent it

The 8-step full-rejoin sequence in `deliberation/B0-recovery-ladder/consensus.md` (close old PC →
clear local state → reuse existing tracks → new PC/session → announce over WS → resubscribe) is
**already implemented** by the ICE-transport-recovery path: `resetForTransportRecovery()` +
the registered `transportRecoveryHandler` (wired by `room.page.ts` to
`republishSfuAfterTransportRecovery()` → `publishInitialSfuWithRetry()`), which already reuses
`MediaService`'s live tracks (no re-getUserMedia) and already announces the fresh `sfu-publish` over
WS (`announceSfuPublishState()`). B2b's rung-3 rejoin coordinator calls this SAME path rather than
re-driving `doPublish`/WS announce from scratch — the only genuinely new pieces are the
coalescing lock, the throttle window, the explicit resubscribe-all step, and the rung-4 signal/UI.

## Code Changes

### `frontend/src/app/services/sfu-client.service.ts`
- **`SfuRecoveryDiagnosticsEvent.rung`** gains `'sfu-rejoin'` and `'unrecovered-visible'` (not scoped
  to one publisher — sentinel `publisherClientId: '*'`).
- **Coalescing + throttle state:** `rejoinScheduled` (lock), `sfuRejoinTimestamps` (pruned to a 2-min
  window), `sfuRejoinThrottled` signal (public — drives rung-4 UI), test-overridable `nowMs()` (the
  fake-timed spec harness fakes `setTimeout`, not `Date`).
- **`handleNeedsRejoinTrigger()`:** the coalescing entry point, called from all 3 existing
  `emitRecoveryEvent('needs-rejoin', ...)` sites (rung-2 exhaust; both live-mid-conflict/mid-call
  cap-exhaust escalation paths). No-ops if a rejoin is already scheduled — same-tick triggers from
  multiple publishers collapse to one.
- **`runFullSfuRejoin()`:** guards (no creds/not published; defers to a genuinely in-flight ICE
  transport recovery rather than double-rotating the PC), throttle check (≤1/15s AND ≤2/2min → emits
  `unrecovered-visible` + sets `sfuRejoinThrottled`), then `resetForTransportRecovery()` +
  `await transportRecoveryHandler()` (the reused production path), then
  `subscribeAllAdvertisedRemotes()` — bails early if superseded by a newer epoch mid-flight.
- **`subscribeAllAdvertisedRemotes(capturedEpoch)`:** new, service-level (not the Angular component
  effect — deliberately, per the brief, so it's testable without an Angular harness). Iterates
  `remotePublishers()` (every advertised publisher, not just the trigger's), sequential
  `enqueue()`-per-publisher (avoids cross-publisher mid races), mark-before-await guard against
  double-subscribe, epoch check before each iteration, falls back into
  `scheduleRecoveryEscalation()` on a per-publisher failure (never silent).
- **`retryFullSfuRejoinNow()`** (public): the rung-4 "Retry" button's handler — re-runs the same
  throttle-gated trigger rather than bypassing the safety cap.
- **`debugForceRejoinThrottledForTest()`** (public, test-only): forces the rung-4 signal for
  deterministic screenshot/e2e proof, mirrors the existing `RemoteAudioService.injectRemoteSourceForTest`
  convention.
- **Diagnostics:** `publishDiagnosticsDebug()` (spread into all 3 `collectDiagnostics()` return
  branches) gains a `recoveryLadder: { lastRung, lastEpoch, rejoinAttemptsInWindow, throttled }`
  block — data only; the B5 diagnostics-page redesign is untouched.
- **`destroy()`** clears the new rejoin lock/timestamps/throttled signal alongside the existing
  teardown (hygiene — no dangling state if the service is destroyed mid-rejoin).

### `frontend/src/app/pages/room/room.page.ts` / `.html`
- `sfuRejoinUnrecoveredNotice` computed (reads `sfuClient.sfuRejoinThrottled()`) + `retrySfuRejoin()`
  handler, rendered as a `.device-notice.sfu-rejoin-unrecovered-notice` banner (same visual pattern as
  the existing `initialPublishFailureNotice` retry/rejoin banner) with an actionable "Retry" button.
- `window.__meetDebug.forceSfuRejoinThrottledForTest` wired inside the existing
  `hostname === 'localhost'` debug block, plus the corresponding `declare global` type addition.

### `frontend/src/app/services/sfu-recovery-coordinator.spec.ts`
- New `makeMultiSubscribePc()` fixture (increments mid per `setRemoteDescription` call, unlike the
  existing single-subscribe mock which hardcodes mid `'1'`) and a `flushMicrotasks()` helper.
- 4 new test blocks: `COALESCING` + `RESUBSCRIBE-ALL` (combined — same scenario proves both),
  `NO-DUPLICATE-SUBSCRIBE`, `EPOCH-SAFETY-DURING-REJOIN`, `THROTTLE` (5 sub-assertions walking the
  15s/2min windows via the overridden `nowMs()`). See scenarios.md S1-S9.

### `e2e/tests/sfu-b2b-rejoin-ui/sfu-rejoin-ui.spec.ts` (new)
- Single-client rendered-DOM/screenshot proof for the rung-4 banner (S10) — the mechanism itself is
  proven in the fake-timed spec above, this only proves the UI actually renders.
- **Pre-existing, unrelated bug flagged (not fixed here, out of this batch's scope):**
  `e2e/fixtures/auth.ts`'s `loginAsJrom()` uses `getByRole('button', { name: 'Sign in' })`, which has
  been ambiguous since `1fbc273` (WK_0623 passwordless-Telegram-login) added a second "Sign in with
  Telegram" button to the login page — `loginAsJrom` now throws a strict-mode-violation on ANY e2e
  spec that calls it. Worked around locally in this new spec file only (`loginAsJromExact`, matching
  `{ name: 'Sign in', exact: true }`) rather than editing the shared fixture, per "surgical, no
  unrelated refactors." Flagging for a follow-up one-line fix to the shared fixture.

## Elite-redteam surface mapping (per APPROVED-PLAN)

| # | Surface | How it's addressed |
|---|---------|---------------------|
| 1 | Healthy peers reliably resubscribed after rotation, not just the trigger publisher | `subscribeAllAdvertisedRemotes()` iterates ALL of `remotePublishers()`, not a per-trigger list — proven by S2/`RESUBSCRIBE-ALL` (bob triggers, alice is a bystander, both come back) |
| 2 | No duplicate subscriptions / ghost `<audio>` elements surviving the rotation | Duplicate subs: mark-before-await `subscribedClientIds` guard (S3/`NO-DUPLICATE-SUBSCRIBE`). Ghost elements: `RemoteAudioService.syncPeers()` already diffs by `(stream, track)` identity — `clearLocalTransportSessionState()` resets `remoteStreams` to a fresh empty `Map`, so every post-rejoin peer gets a brand-new `MediaStream`, and `syncPeers` tears down the stale `<audio>` element automatically (inherent, no new code — not independently unit-tested here since it requires an Angular component harness disproportionate to the unchanged logic it exercises) |
| 3 | Coalescing — N same-tick `needs-rejoin` → exactly ONE rejoin | S1/`COALESCING` |
| 4 | Defer-to-in-flight-ICE-recovery guard never double-rotates the PC | `runFullSfuRejoin()` returns early if `transportRecoveryInFlight \|\| transportRecoveryScheduled` (not independently unit-tested — both flags are private to the pre-existing ICE-recovery IIFE with no seam to drive them without duplicating that machinery; the guard is a one-line defensive read of state B2a/pre-existing code already maintains) |
| 5 | Throttle-exhaust sets visible unrecovered AND the per-publisher low-freq keeps trying (never silent) | S5-S9/`THROTTLE` for the visible-state half; the low-freq continuation is untouched B2a machinery (its own timers/re-arm are outside `runFullSfuRejoin`'s early-return path when throttled, so they keep firing on their existing 30s cadence — proven by B2a's own tests, not re-proven here) |

## Accepted collateral (documented, not a regression)

A coalesced full rejoin rotates the ENTIRE local PC, so every existing remote subscription — including
ones from publishers that were never unhealthy — drops and is rebuilt (S2). This is the explicit,
spec'd meaning of "local transport/session rotation" in the B0 consensus, not a bug: a brief audio/video
blip for otherwise-healthy peers is the accepted cost of one coalesced rejoin instead of N independent
per-publisher failures each attempting their own recovery.
