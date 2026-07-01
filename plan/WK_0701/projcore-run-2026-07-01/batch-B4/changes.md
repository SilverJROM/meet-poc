# Batch B4 — Changes

## SEND-BACK iter 1 (corrections/batch-B4-iter1.md, converging — all else PASSED)

Validator: everything passed (clobber-guard, B2a/B2b regression, stuck-banner reset, publish-storm,
capped-branch wiring, R4c UI screenshot) except one R4b gap — `publishInitialSfuWithRetry()`'s TWO real
terminal publish-failure exits (transceiver-check failure, and permanent/retry-cap exhaustion) set
`audio-failed` and returned WITHOUT calling `escalatePublishFailure()`, because that call previously only
lived inside the `finally` block's `shouldSurfacePublishFailure` choke point — which is only true while
the gate is still `'audio-connecting'`, i.e. never true for these two exits (they already set
`'audio-failed'` themselves before the `finally` runs). So the Glory case got only the manual Rejoin
button, not the automatic rejoin R4b requires.

**Fix, plus one thing the ask didn't call out that I verified before shipping:** added
`this.sfuClient.escalatePublishFailure()` at both exits, per the ask. Before wiring it up I checked
whether the call would actually DO anything at each site, rather than trusting the guard/throttle
reasoning by inspection alone — and found the transceiver-check exit is a genuine trap: at that point
`publish()` has ALREADY succeeded (`localPublishState.status === 'published'`); the failure is
`hasOutboundAudioTrack()` returning false 2s later. `isLocalPublishHealthy()` only inspects
`status`/PC/ICE state, so it reads `'published'` as healthy and `escalatePublishFailure()`'s own
never-clobber-a-healthy-publish guard would make the added call a **silent no-op** — the automatic
rejoin the ask wants simply wouldn't fire. Confirmed this empirically with a throwaway probe script
before touching any real code (see review.md).

Added `SfuClientService.markPublishAttemptFailed(reason)` — a small, narrowly-scoped method that marks
`localPublishState` as `'error'` ONLY if it's still (stale) `'published'`; a no-op otherwise. Called
right before `escalatePublishFailure()` at BOTH terminal exits (the permanent/retry-cap exit is usually
already `'error'` via `doPublish`'s own catch, so the call is typically a no-op there too — but it's not
guaranteed if the thrown error came from a later step like `republishLiveScreenTrackIfNeeded()` after a
successful `publish()`, so both exits get the same guaranteed-correct sequence). This does **not** touch
`escalatePublishFailure()`'s own guard/throttle/notice logic, per the ask — it only ensures the state that
logic reads is accurate at the point of the call.

Added 2 new fake-timer-free tests to `sfu-recovery-coordinator.spec.ts` mirroring each exit's exact
sequence (`TERMINAL-TRANSCEIVER-FAILURE-ESCALATES`, `TERMINAL-RETRY-CAP-ESCALATES`) — the first would have
failed (handler never called) against the naive "just add the call" fix, which is exactly why it was
written as a reproduction-of-the-gap-then-proof-of-the-fix, not just a happy-path assertion.

## User Report (verbatim)

"If an admitted user has no SFU PeerConnection or failed publish state (hasPc:false,
publishStatus:null/error) after joining, the app must recover. Acceptance: (a) the app identifies the
state as media-not-published; (b) it retries publish or rejoins SFU without requiring the user to leave
the room manually; (c) if unrecoverable, the UI tells the user exactly what failed." (R4) — anchored to
north-star #1: "Silent failure is not acceptable." This is the Glory case from call 2: an admitted client
with `hasPc:false`/`publishStatus:null|error` after joining — their media never published, so everyone
sees them advertised-not-subscribed and they themselves hear no one.

## Root Cause (mechanism)

Two dead ends, both already flagged by prior batches' code comments:

1. **`handleTransportStateChange`'s `'capped'` branch** (`sfu-client.service.ts`) — when ICE-transport
   recovery exhausts its own retry cap, it only logged `"...leaving retry/rejoin UI to publish recovery
   path"` and did nothing else. No such publish-recovery path actually consumed this signal — it was a
   comment describing recovery that had never been built (confirmed dead by B2b's red-team).
2. **`runFullSfuRejoin()`'s (rung-3) precondition** — `if (this.localPublishState()?.status !== 'published')
   return;` — makes the existing full-rejoin mechanism a no-op for exactly R4's failure class (never
   reached `'published'` in the first place). Rung-3 was correctly built for "was healthy, subscriptions
   degraded" recovery; the Glory case needed a sibling entry point with a different precondition, sharing
   the same throttled executor rather than a second parallel one.

Separately, `publishInitialSfuWithRetry()`'s existing 3-attempt retry loop already has a single,
well-audited terminal choke point (`shouldSurfacePublishFailure` in its `finally` block, CR-FIX-1) that
catches every silent exit — but on exhaustion it only showed a (host-gated) interim notice and waited for
a manual "Rejoin" click. Nothing escalated automatically.

## Design decision: extract, don't duplicate, the throttled rejoin executor

See `decisions/2026-07-01-b4-host-agnostic-terminal-notice.md` for the one deliberate policy deviation
(the new terminal notice is host-agnostic, unlike R9's quiet-guest interim notice).

`runFullSfuRejoin()`'s body (throttle check → `resetForTransportRecovery()` → `transportRecoveryHandler()`
→ `subscribeAllAdvertisedRemotes()`) was extracted verbatim into a new private
`executeThrottledFullRejoin(reason: 'subscribe' | 'publish')`. `runFullSfuRejoin()` itself is now a
2-line wrapper: keep its exact original precondition, then delegate. This means:
- Zero behavior change for the existing rung-3/rung-4 (B2a/B2b) subscribe-side path — same coalescing
  lock (`rejoinScheduled`), same ≤1/15s + ≤2/2min throttle window (`sfuRejoinTimestamps`), same epoch
  guard, same resubscribe-all step.
- The new publish-side entry point (`escalatePublishFailure()`) shares that IDENTICAL throttle budget —
  a publish-triggered escalation and a subscribe-triggered rejoin can never combine into a storm, because
  they draw from the same timestamp window.

## Code Changes

### `frontend/src/app/services/sfu-client.service.ts`
- New `readonly publishRecoveryFailed = signal(false)` — true once an escalated publish-recovery attempt
  completes and the local publish is STILL unhealthy; false once a publish actually reaches `'published'`
  again (reset both at the escalation's own post-check and directly at `doPublish`'s success set-site, so
  a normal manual "Retry audio"/"Rejoin" success also clears it, not just an escalation success).
- `runFullSfuRejoin()` (private): reduced to its original precondition
  (`localPublishState()?.status !== 'published'` → return) + delegates to the new shared executor.
- New private `executeThrottledFullRejoin(reason: 'subscribe' | 'publish')`: the extracted rung-3 body,
  verbatim except for reason-tagged log lines.
- New public `escalatePublishFailure(): void` — the R4 entry point. Guards (checked before touching
  anything):
  1. `isLocalPublishHealthy()` → no-op (never clobber a healthy publish — handshake concern #1).
  2. `status === 'publishing'` → no-op (never interrupt an attempt already in flight — handshake concern #1).
  3. `rejoinScheduled` → no-op (coalesce with any in-flight rejoin, subscribe- or publish-triggered).

  Otherwise calls `executeThrottledFullRejoin('publish')` and, on completion, sets
  `publishRecoveryFailed` to `!isLocalPublishHealthy()` — covers BOTH "the rejoin attempt ran and still
  failed" and "the attempt was throttled out" as the same observable "still not healthy" outcome.
- `handleTransportStateChange`'s `'capped'` branch: now calls `this.escalatePublishFailure();` after its
  existing log line (R4 item 2b — the dead-end wiring).
- `doPublish`'s success set-site (`localPublishState.set({..., status:'published', ...})`): added
  `this.publishRecoveryFailed.set(false);` immediately after — so a normal (non-escalation) successful
  publish also clears any stale unrecoverable flag (handshake concern #3, tested in S8).
- New test-only `debugForcePublishRecoveryFailedForTest()` (mirrors the existing
  `debugForceRejoinThrottledForTest()`), for deterministic e2e screenshot proof.

### `frontend/src/app/pages/room/room.page.ts`
- `publishInitialSfuWithRetry()`'s existing `shouldSurfacePublishFailure` terminal `finally` block: added
  one call, `this.sfuClient.escalatePublishFailure();`, inside the existing `if` — this is the SINGLE
  choke point for every silent exit out of the retry loop (transceiver-check failure, non-retryable
  publish error, retry-cap exhaustion, or a mid-loop state change), so no new call sites were added
  elsewhere in the function.
- New computed `readonly publishRecoveryUnrecoverableNotice` — `"We couldn't restore your audio
  automatically. Please rejoin to reconnect."` when `sfuClient.publishRecoveryFailed()` is true, else
  `null`. Deliberately NOT gated by `shouldShowAudioFailNotice({isHost})` — see the decisions doc.
- `window.__meetDebug` (localhost-only debug block): wired
  `forcePublishRecoveryFailedForTest` → `sfuClient.debugForcePublishRecoveryFailedForTest()`, plus the
  corresponding `declare global` type addition.

### `frontend/src/app/pages/room/room.page.html`
- New `@if (publishRecoveryUnrecoverableNotice(); ...)` block, right after the existing rung-4
  `sfuRejoinUnrecoveredNotice` banner — same `device-notice` styling, its own
  `.publish-recovery-unrecoverable-notice` class, a "Rejoin" button wired to the existing
  `rejoinAfterInitialPublishFailure()` (the heavier, guaranteed-fresh full local rejoin).

### Tests
- `frontend/src/app/services/sfu-recovery-coordinator.spec.ts`: 6 new assertions (NEVER-PUBLISHED-ESCALATE,
  NO-CLOBBER-HEALTHY, NO-CLOBBER-IN-FLIGHT, UNRECOVERABLE-ON-FAILURE, CAPPED-WIRES-TO-ESCALATE,
  THROTTLE-SHARED) — all plain `node:assert`, no new fake timers (no new timers were introduced).
- `frontend/src/app/services/sfu-client.spec.ts`: 1 new test driving a real `sfu.publish()` through the
  existing `withPublishPeerConnectionRecorder` harness, proving `publishRecoveryFailed` resets on a
  genuine successful publish (not just via the escalation path).

## Scope discipline

No changes to B5 (diagnostics page) beyond the pre-existing `publishDiagnosticsDebug()` event stream,
which already emits `hasPc`/`publishStatus`/`recoveryLadder` and needed no modification. No changes to
`publishInitialSfuWithRetry`'s internal retry/backoff logic, `derivePublishGateStatus`, or
`shouldSurfacePublishFailure` — B4 adds exactly one new call at their existing terminal choke point. No
changes to the existing interim `initialPublishFailureNotice`/`shouldShowAudioFailNotice` host-gating
(R9) — only the NEW terminal notice deviates from it, and only for the genuinely-unrecoverable end state.
