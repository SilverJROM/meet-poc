# Batch B4 — Self Review

## SEND-BACK iter 1 self-review

The ask was narrow ("call escalatePublishFailure() at both terminal exits, execute ONLY that"). Before
making the two one-line additions, I traced what state `isLocalPublishHealthy()` would actually see at
each call site, because `escalatePublishFailure()`'s first guard is "if healthy, no-op" and I wanted to
confirm the call would do real work, not just satisfy the letter of the request.

- **Retry-cap-exhaustion exit:** the exception originates inside `doPublish` (the publish HTTP round
  trip itself failing), whose own `catch` already sets `status:'error'` before rethrowing — so by the
  time this exit's code runs, `isLocalPublishHealthy()` is already `false`. The bare call would have
  worked here in the common case.
- **Transceiver-check-failure exit:** `publish()` already returned successfully (`status:'published'`)
  before this check runs 2s later — `hasOutboundAudioTrack()` failing doesn't touch `localPublishState`
  at all. I verified this empirically with a disposable probe script (created a real `SfuClientService`
  via the same injector pattern the coordinator spec uses, set `localPublishState` to `'published'` with
  a live-looking mock `pc`, then called `escalatePublishFailure()` directly) — confirmed `handlerCalls`
  stayed `0`. A bare "just add the call" fix would have passed a superficial code review (the line is
  there) while doing nothing at runtime for exactly the failure this batch's own scenario S1
  ("transceiver not established") targets.

Fixed by adding `markPublishAttemptFailed(reason)` — checked-in only if it's genuinely needed (no-op when
status is already not `'published'`), verified with a follow-up probe that the fixed sequence now
produces `handlerCalls === 1`, then converted both probes into the permanent
`TERMINAL-TRANSCEIVER-FAILURE-ESCALATES`/`TERMINAL-RETRY-CAP-ESCALATES` tests and deleted the throwaway
scripts. Applied `markPublishAttemptFailed` at BOTH exits (not just the transceiver one) since the
retry-cap exit shares the same class of risk in the narrower case where the thrown error comes from
`republishLiveScreenTrackIfNeeded()` after a successful `publish()` — the same failure shape, just a
rarer trigger. This does not touch `escalatePublishFailure()`'s own guard/throttle/notice logic, per the
ask's explicit "preserve everything else."

## Scope adherence

- ✅ R4 publish/PC recovery only, reusing `localPublishState`, `publishInitialSfuWithRetry`,
  `runFullSfuRejoin`'s internals (extracted, not duplicated), and `initialPublishFailureNotice`'s sibling
  banner pattern — no second recovery loop built.
- ✅ Did not touch B5 (diagnostics page) beyond the pre-existing `publishDiagnosticsDebug()` event stream
  (unchanged — no new fields).
- ✅ No unrelated refactors — `runFullSfuRejoin()` keeps its exact original precondition and behavior;
  only its internals moved into a shared, reason-tagged executor.

## Handshake concerns — verified, not assumed

1. **Never touch a healthy or in-progress publish.** `escalatePublishFailure()`'s first two guards are
   `isLocalPublishHealthy()` and `status === 'publishing'` — both checked BEFORE any state mutation.
   Verified with dedicated tests (NO-CLOBBER-HEALTHY, NO-CLOBBER-IN-FLIGHT): handler call count stays 0
   in both cases, not just inferred from the guard's presence.
2. **The extraction must not change `runFullSfuRejoin` behavior.** Re-ran the full pre-existing
   `sfu-recovery-coordinator.spec.ts` B2a/B2b suite (COALESCING, RESUBSCRIBE-ALL, NO-DUPLICATE-SUBSCRIBE,
   THROTTLE ×10, EPOCH-GUARD, EPOCH-SAFETY-DURING-REJOIN, MID-CALL-NEVER-GIVES-UP,
   LIVE-MID-CONFLICT-FALLBACK, R3-PER-PUBLISHER) — all green, unchanged. Also re-ran
   `sfu-repro-harness.spec.ts` and `sfu-recovery-epoch.spec.ts`. Confirmed via `grep` that no existing spec
   asserted the old inline guard structure directly (only the externally-observable throttle/coalescing
   behavior, which is preserved).
3. **`publishRecoveryFailed` must reset on a later successful publish, and must not flip true while a
   legit retry is still in progress.** Two separate reset paths, both tested: (a) the escalation's own
   post-check (`!isLocalPublishHealthy()` after the throttled attempt) — tested via
   NEVER-PUBLISHED-ESCALATE (clears false on success); (b) a direct reset at `doPublish`'s success
   set-site, covering the case where the user manually retries/rejoins outside the escalation path
   entirely — tested via `sfu-client.spec.ts`'s new real-`publish()` test (S8). "Must not flip true while
   a legit retry is in progress" is the `status === 'publishing'` guard itself — `escalatePublishFailure`
   is a no-op during any in-flight attempt, so it structurally cannot flip the flag mid-retry.
4. **No publish/rejoin storm — shares the ≤1/15s ≤2/2min throttle.** Not just structural — proven with a
   dedicated THROTTLE-SHARED test: two subscribe-triggered rejoins consume the shared 2/2min budget, then
   a publish-triggered `escalatePublishFailure()` is throttled (not executed as a third rejoin), while
   still surfacing `publishRecoveryFailed:true` (not silently latched).

## Requirement-by-requirement

- **R4a (identify media-not-published):** `isLocalPublishHealthy()` — already combines `hasPc` (via
  `!!this.pc`) + `status==='published'` + live ICE/connection state — is reused as the exact classifier;
  no new detection logic invented. Two event-driven trigger points (retry-loop exhaustion, transport-
  capped) cover both "never established" and "was fine, PC died later" without a new polling watchdog.
- **R4b (auto-recover, no manual leave):** `publishInitialSfuWithRetry`'s existing internal 3-attempt
  retry runs first (unchanged); on exhaustion, `escalatePublishFailure()` fires automatically from the
  single terminal choke point — no button click required. Bounded by the shared throttle (concern #4
  above); item 2b (capped-transport wiring) is the second automatic trigger.
- **R4c (unrecoverable → explicit UI):** `publishRecoveryUnrecoverableNotice` renders an exact, specific
  message ("We couldn't restore your audio automatically. Please rejoin to reconnect.") with an
  actionable Rejoin button, host-agnostic by design (see decisions doc) — not a silent latched state.
  Screenshot proof captured (`batch-B4/screenshots/b4-publish-recovery-unrecoverable-notice.png`).

## Risks / caveats

- **Host-agnostic terminal notice deviates from R9's quiet-guest interim pattern** — deliberate, logged
  in `decisions/2026-07-01-b4-host-agnostic-terminal-notice.md`, scoped to only the new terminal notice
  (the pre-existing interim notice keeps its host gate).
- **`escalatePublishFailure()`'s single automatic retry attempt is not internally re-armed** — if that one
  rejoin attempt fails and the shared throttle hasn't yet tripped, no second automatic attempt fires
  until another distinct trigger occurs (a further transport-capped event, or the user's own manual
  "Rejoin" click on the new banner). This was a deliberate choice over inventing a new re-arm timer: the
  brief's "bounded/throttled, no publish storms" instruction plus "reuse, don't reinvent" argued against
  adding new timer state; the shared throttle (≤2/2min across BOTH triggers) already bounds total system
  load, and the terminal banner always gives the user an explicit, working manual path forward — never a
  silent dead end.
- **e2e test port isolation:** the batch's Playwright screenshot run collided with an already-running live
  dev backend on the default e2e port (4720) — resolved by running with distinct
  `E2E_BACKEND_PORT`/`E2E_FRONTEND_PORT`/`E2E_PROXY_PORT`/`E2E_BASE_URL` env overrides rather than
  touching the live process. Confirmed no orphan processes or test-prefixed rooms remained after the run.

## Verdict

READY for independent validation ([REDTEAM:standard] per the brief).
