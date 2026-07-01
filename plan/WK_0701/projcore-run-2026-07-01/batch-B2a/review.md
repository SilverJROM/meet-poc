# Batch B2a — Self Review

## Scope adherence

- ✅ Coordinator + epoch guard + rungs 1-2 only, keyed by publisherClientId (epoch is a single
  service-wide counter — B0 consensus's `{epoch, publisherClientId}` compound key is realized as
  "current epoch, gated per-publisher maps," not a literal tuple key; behaviorally equivalent since a
  bump invalidates every in-flight op regardless of publisher).
- ✅ Rung 3 (full local SFU rejoin) NOT implemented — `needs-rejoin` event is the seam B2b consumes.
- ✅ No terminal give-up anywhere in the primary path: verified by driving 3+ low-frequency cycles past
  rung-2 exhaustion and asserting a POST + `throttled` event each time.
- ✅ Mid-call-subscribe-retry and live-mid-conflict-retry left on their pre-existing flat-cap logic
  (approved carve-out) — only gained the epoch-guard bind-check via the shared `doSubscribeTracks` choke
  point.
- ✅ B1's `sfu-recovery-epoch.ts` predicate and `lastSubscribeFailureEvidence` reused as-is, not rebuilt.
- ✅ B1's repro tests updated to assert the escalation outcome (required flip, not a new/separate test
  file replacing them).

## Risks / caveats

- `peer.micEnabled !== false` (listed as a trigger gate in the brief) is NOT wired into
  `canRunSubscribeRecovery()` — `RemotePublisher` (the SFU-layer roster entry) carries no mic-enabled
  field today; that concept lives in `room.page.ts`'s `PeerIdentity` model, which the coordinator (deliberately
  scoped inside `SfuClientService`, no page-level dependency) doesn't see. Since B2a's failure domain is
  "advertised but never subscribed" (no audio flowing at all yet), gating on mic state would be wrong here
  anyway — a muted peer's track still needs the subscribe pipeline established so audio flows the instant
  they unmute. The mic-off "healthy silence" distinction matters for B3's subscribed-but-silent stall
  detection, not B2a's not-yet-subscribed recovery. Flagging for validator awareness, not deferring a fix.
- Jitter (`SUBSCRIBE_RECOVERY_JITTER_MAX_MS = 50`) is a thin wrapper local to the new rung timers, not
  added to the shared `planSubscribeRetry()` — avoids perturbing the untouched mid-call/live-mid-conflict
  callers that also use that function.
- `recoveryEpoch` bumps happen at every `resetOpQueue()` call site, including `resetFailedPublishAttempt()`
  (pre-publish-success failure) — harmless (no subscribe state exists yet at that point) but bumps epoch
  more broadly than strictly required; simpler and more uniform than special-casing which resets "count."
- New `sfu-recovery-coordinator.spec.ts` duplicates ~5 small fixture helpers from
  `sfu-repro-harness.spec.ts` (no shared test-utils module exists for these standalone `tsx`-run specs) —
  consistent with the existing one-file-per-concern pattern, not introducing a new shared module for this
  atomic slice.

## Verdict

READY for independent validation.
