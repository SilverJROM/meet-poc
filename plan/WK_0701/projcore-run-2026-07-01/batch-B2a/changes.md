# Batch B2a — Changes

## SEND-BACK iter 2 (corrections/batch-B2a-iter2.md, converging)

Validator: mid-call gap cleared. ONE remaining terminal-stop path — the live-mid-conflict FALLBACK.

**Root cause:** initial subscribe hits a `LiveMidConflictError` → forced renegotiated retry runs → that
retry fails with a NON-conflict error → the fallback catch (`scheduleLiveMidConflictRenegotiationRetry`'s
caller, ~L525) called legacy `nextSubscribeRetry()`. On cap-exhaust, `nextSubscribeRetry` (~L415) logs
"permanently stopped" and returns `shouldRetry:false` — and because `if (!retry.shouldRetry) return` ran
BEFORE `subscribedClientIds.delete(...)`, the guard stayed latched forever (a real R2 violation).

**Fix 1 (the named target) — `sfu-client.service.ts` ~L525-540:** on `!retry.shouldRetry` with
`retry.capped` true, mirror the mid-call fix: if `canRunSubscribeRecovery(current)` holds, delete the
guard, emit `needs-rejoin`, and `armSubscribeRecoveryLowFrequencyRetry(current.clientId)`.

**Fix 2 (found via the requested exhaustive grep, closing it in one pass) — `scheduleLiveMidConflictRenegotiationRetry`'s
OWN cap (~L462-490, `LIVE_MID_CONFLICT_RENEGOTIATION_CAP`):** when its 2-attempt renegotiation-retry cap
exhausts, the `source === 'initial-subscribe'` branch already deleted `subscribedClientIds` (self-clears +
"awaits fresh state" — option (a) from the ask), but that's a passive wait, not a guarantee, and the
`source === 'mid-call-subscribe'` branch did NEITHER (a) nor (b) — no guard to clear at that level, no
low-frequency arm. Added the same `canRunSubscribeRecovery` + `needs-rejoin` + low-frequency-arm safety net
for BOTH sources, uniformly. `armSubscribeRecoveryLowFrequencyRetry` already no-ops if already armed, so
this can't double-arm when both this cap and the fallback's cap fire for the same publisher.

### Exhaustive grep — every capped/`!shouldRetry`/early-return subscribe decision in the service (per ask #2)

| Location | Mechanism | Outcome | Verdict |
|----------|-----------|---------|---------|
| `scheduleRecoveryEscalation` rung-1 `if (!rung1.capped)` (~L272) | Primary coordinator | Falls through to rung-2 check in the same call | ✅ not a give-up (already correct) |
| `scheduleRecoveryEscalation` rung-2 `if (!rung2.capped)` (~L291) | Primary coordinator | Falls through to `needs-rejoin` + low-freq arm | ✅ not a give-up (already correct) |
| `nextSubscribeRetry` capped branch (~L415-417) | Live-mid-conflict fallback's only caller (~L532) | **Fixed this iteration** — now clears guard + `needs-rejoin` + low-freq arm | ✅ fixed |
| `scheduleLiveMidConflictRenegotiationRetry` cap (~L475-486) | Live-mid-conflict retry's own ceiling | **Fixed this iteration** — both sources now get the low-freq safety net | ✅ fixed |
| `scheduleMidCallSubscribeRetry` capped branch (~L1500-1512) | Mid-call subscribe | `needs-rejoin` + low-freq arm (SEND-BACK iter 1) | ✅ not a give-up (fixed iter 1) |
| `handleTransportStateChange` `decision.action === 'capped'` (~L805-812) | Local ICE/PC transport-level reconnect (`planSfuTransportRecovery`, `SFU_TRANSPORT_RECOVERY_CAP`) | Logs and stops attempting ICE restart; comment explicitly defers to "publish recovery path" | ✅ NOT an R2 subscribe-path give-up — this is R4 (publish/PC recovery, B4 per queue.md), a different mechanism entirely. Confirmed out of scope, not touched. |

`nextSubscribeRetry(` confirmed called from exactly one site (~L532, the fallback) via
`grep -n "nextSubscribeRetry("` — its terminal branch is no longer a terminal outcome for any live path.

## SEND-BACK iter 1 (corrections/batch-B2a-iter1.md)

Validator found ONE surviving terminal give-up: `scheduleMidCallSubscribeRetry()` (a NEW audio track
advertised mid-call, e.g. a peer unmuting after joining — the HRIS_TOJ pattern) still used the legacy
flat cap and logged "permanently stopped" instead of escalating. Fixed:

- `sfu-client.service.ts` (~L1500): on legacy mid-call cap-exhaust, instead of just warning and stopping,
  check `canRunSubscribeRecovery(publisher)` and — if it holds — emit `needs-rejoin` and arm the SAME
  shared `armSubscribeRecoveryLowFrequencyRetry(publisherClientId)` continuation the primary path uses
  (coalesces cleanly: it no-ops if already armed). Does NOT replay rung-1/rung-2 from zero — the legacy
  7-attempt cap already burned the same-session retry budget, so this routes straight to the low-frequency
  continuation, matching the validator's suggested approach.
- `sfu-client.spec.ts`: removed the obsolete "cap exhaustion stops permanently" test (FIX2, was ~L568-599)
  outright rather than rewriting it in place — this large legacy-style file mixes real- and fake-timer
  tests, and firing/re-arming the never-give-up low-frequency timer inside it risks leaving a real
  background timer alive after the file's synchronous work finishes (confirmed: a separate pre-existing
  test, SFU-R3 ~L1856, calls `handleSfuPresence` with an always-failing mock outside any fake-timer
  wrapper — under the old capped behavior this eventually stopped; under never-give-up it now arms a real
  recurring timer, so an explicit `sfu.destroy()` teardown was added at the end of that test to prevent it
  from ever firing). Added a `close(): void {}` no-op to the shared `makeSingleTrackSubscribePc()` fixture
  (was missing — needed once a test actually calls `destroy()`/`closePeerConnectionForRecovery()`).
- `sfu-recovery-coordinator.spec.ts` (already fake-timed, proven to terminate): added
  `MID-CALL-NEVER-GIVES-UP` — presets the legacy mid-call counter to the cap boundary, triggers
  `subscribeNewRemoteTracks`, asserts `needs-rejoin` + low-frequency armed, then actually FIRES the fake
  low-frequency timer and asserts another subscribe attempt fires and the timer re-arms — the full
  behavioral proof, safely.

## User Report (verbatim)

"When /api/sfu/tracks fails or a remote track stays advertised-not-subscribed, the app recovers and does
NOT terminally give up while the user is admitted and audio is advertised. The permanent-stop cap escalates
retry → renegotiate → full SFU rejoin (fresh cfSessionId) instead of terminal give-up. Diagnostics record
each recovery step + outcome." (R2, B2a scope: retry → renegotiate portion; full rejoin is B2b.)

## Root Cause (mechanism, per B1)

`sfu-client.service.ts`'s `nextSubscribeRetry()` capped same-session subscribe retry at 7 attempts, and
both call sites (`subscribeIfNeeded`'s catch, `armSubscribeStuckWatchdog`'s stuck-timeout) treated `capped`
as a terminal state: `subscribedClientIds` stayed latched with **no further action scheduled** — the guard
never got deleted, no next attempt was ever queued. There was no forced-renegotiation escalation step and
no mechanism to keep trying afterward; "capped" meant "stop forever until `cfSessionId` changes."

## Code Changes

### `frontend/src/app/services/sfu-client.service.ts`
- **Recovery epoch:** `recoveryEpoch` counter + `resetOpQueue()` helper (replaces the 4 raw
  `this.opQueue = Promise.resolve()` sites in `clearLocalTransportSessionState`, `resetFailedPublishAttempt`,
  `closeLiveTracksForExit`, `destroy`) — every local reset/rejoin is a new epoch generation.
- **Recovery coordinator** (new): `scheduleRecoveryEscalation()` / `runRecoverySubscribeAttempt()` /
  `armSubscribeRecoveryLowFrequencyRetry()`, keyed per `publisherClientId`, gated by `canRunSubscribeRecovery()`
  (admitted+session · local publish `published` · publisher present in `remotePublishers` · publisher
  advertises ≥1 audio track). Wired into `subscribeIfNeeded`'s catch and `armSubscribeStuckWatchdog`'s
  timeout, replacing their calls into the old `nextSubscribeRetry`/`scheduleSubscribeRetryBackoff` pair.
  - **Rung 1** (`subscribeRecoveryRung1Attempts`, cap 3, backoff 250/500/1000ms + jitter): same-session
    retry — clears that publisher's sub state via the existing `clearPublisherSubscriptionStateForRetry`,
    then re-subscribes via `doSubscribeTracks(publisher, publisher.tracks)`.
  - **Rung 2** (`subscribeRecoveryRung2Attempts`, cap 2, backoff 500/1000ms + jitter): same clear, then
    `doSubscribeTracks(publisher, publisher.tracks, {forceRenegotiation:true})`.
  - **No terminal give-up:** once rung-2 exhausts, emits `needs-rejoin` (once) and arms a bounded
    ~30s low-frequency continuation (`armSubscribeRecoveryLowFrequencyRetry`) that keeps retrying
    same-session while `canRunSubscribeRecovery()` holds, emitting `throttled` each cycle. Never re-latches
    `subscribedClientIds` with nothing scheduled.
  - `lastRecoveryEvent` signal (new, mirrors `lastSubscribeFailureEvidence`'s pattern) carries
    `{rung, publisherClientId, epoch, attempt, atMs}` for `subscribe-retry` / `subscribe-renegotiate` /
    `needs-rejoin` / `throttled` — the diagnostics events B5 will surface and B2b will consume
    (`needs-rejoin`) to trigger the full rejoin.
- **Epoch guard wired:** `doSubscribeTracks` now accepts `capturedEpoch` (captured by every caller right
  before its `enqueue()` call — `subscribeIfNeeded`, the new coordinator, `enqueueMidCallSubscribeTracks`,
  and `scheduleLiveMidConflictRenegotiationRetry`'s retry timer) and checks B1's
  `shouldBindSubscribeResponse()` immediately after the existing stale-cfSession guard, before any state
  mutation. A stale-epoch response now returns (no-op, no throw) exactly like the existing stale-cfSession
  case — closes the "old in-flight subscribe binds onto a post-rejoin PC" hazard the B0 consensus called out
  (opQueue reset abandons in-flight ops without cancelling their already-dispatched promises).
- Every place that previously cleared `subscribeRetryAttempts` for a publisher (`processOntrack` on first
  frame, `handleSfuPresence`/`handleSfuRoster` on publisher reconnect, `tearDownPeerSubscription` on peer
  leave) now also clears the new rung-1/rung-2 counters and cancels any pending low-frequency timer via
  `clearSubscribeRecoveryState()`.
- **Unchanged (explicit scope carve-out, approved in plan handshake):** the legacy `subscribeRetryAttempts`
  map, `nextSubscribeRetry()`, `scheduleSubscribeRetryBackoff()`, and their cap-7 constants remain — they
  now serve ONLY the live-mid-conflict fallback path (`scheduleLiveMidConflictRenegotiationRetry`'s
  non-conflict catch), which keeps its pre-B2a behavior. Mid-call-subscribe-retry
  (`scheduleMidCallSubscribeRetry`) is likewise unchanged. Both gained the epoch-guard bind-check (shared
  choke point in `doSubscribeTracks`) but not the rung-1/rung-2/low-freq ladder; full convergence into one
  coordinator for these paths is B2b's territory (rejoin coalesces all pending publisher failures).

### `frontend/src/app/services/sfu-repro-harness.spec.ts`
- `driveSubscribeUntilCapGiveUp`/`assertGiveUpOutcome` (asserted the permanent-latch bug) replaced with
  `driveSubscribeRecoveryUntilNeedsRejoin`/`assertEscalationOutcome` + a new
  `assertLowFrequencyContinuationNeverGivesUp` helper. The three BUG-REPRO tests now assert the escalation
  outcome (rung-1 ×3, rung-2 ×2, `needs-rejoin` once) and then drive 3 low-frequency cycles proving another
  POST fires each time — the concrete "never give up" proof.
- Removed `settleFakeTimers` (no longer used — the new drive helper fully replaces its role).

### `frontend/src/app/services/sfu-recovery-coordinator.spec.ts` (new)
- `COORDINATOR-SHAPE`: pins the exact rung sequence
  (`subscribe-retry:1,2,3 → subscribe-renegotiate:1,2 → needs-rejoin:3`) and the `forceRenegotiation` flag
  per POST (`false×4, true×2`).
- `EPOCH-GUARD`: a manually-controlled (`Observable`) subscribe POST is left in flight, `recoveryEpoch` is
  bumped directly (simulating a concurrent local reset/rejoin), then the stale response is resolved —
  asserts `subscribedTracks` stays empty (the bind was skipped).
