Batch-FIX2: Mid-call subscribe retry — a peer unmuting mid-call must reach every subscriber (S-MIDCALL)

Batch ID: batch-fix2
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04
Branch: CONTINUE feat/crossplatform-devices-20260604 (FIX1 @ 1c07bc3 latest). Do NOT commit (3-AGENT: projcore + independent 2nd validator).
Read FIRST: north-star.md (#1 goal: host and users HEAR each other), validation/POSTFIX1/round-tracker.md (S-MIDCALL section).
You are CODEX (gpt-5.5), TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY (3-AGENT: SFU subscribe retry — riskiest area). NO scope creep.
Lifecycle: post-live, Deferral OFF. Effort tier (projcore-proposed): MEDIUM-HIGH. Confirm/counter at PROPOSED.

## THE BUG — CONFIRMED GOAL-BLOCKING by the post-fix regression fan-out (opus reviewer + opus verifier)
This is the exact "you turned your mic on and I can't hear you" failure class — the original complaint that started this run — found by the R2 audit before handback.

`frontend/src/app/services/sfu-client.service.ts` `subscribeNewRemoteTracks` (~line 978-983):
```ts
private subscribeNewRemoteTracks(publisher, previousTracks): void {
  const alreadySubscribed = new Set([...this.midToEntry.values()].map((e) => e.trackName));
  const newTracks = selectNewRemoteTracks(previousTracks, publisher.tracks, alreadySubscribed);
  if (!newTracks.length) return;
  void this.enqueue(() => this.doSubscribeTracks(publisher, newTracks));   // NO .catch / NO retry / NO watchdog / NO version bump
}
```
When a remote peer turns their mic on mid-call, the subscriber gets an `sfu-presence` and subscribes the new audio track via this path. If that single `doSubscribeTracks` THROWS on a transient failure (CF `not_found_track_error` — which the code's OWN comment at ~1478 says "fires within ms of the publish completing"; or an SFU HTTP/renegotiate timeout; or a reconcile mismatch), `doSubscribeTracks` rolls back (removes the audio from midToEntry/subscribedTracks) and RE-THROWS into a dropped promise. Nothing reschedules. On the NEXT `sfu-presence`, `prev.tracks` already contains `audio`, so `selectNewRemoteTracks` filters it out → returns [] → never re-attempted. **Result: that subscriber is PERMANENTLY unable to hear that peer's mic** — no self-heal short of the publisher reconnecting (cfSession change) or the subscriber rejoining.

Why the join-path resilience does NOT cover it (verified): the `.catch` retry in `subscribeIfNeeded`, `armSubscribeStuckWatchdog`, and the `subscribeRetryVersion` effect are all wired ONLY to the JOIN path (`doSubscribe`). The room.page subscribeRetryVersion effect re-runs `subscribeIfNeeded`, which SHORT-CIRCUITS because the publisher is already in `subscribedClientIds` (added at join). The stuck-watchdog was disarmed when the camera's first frame arrived and is keyed per-publisher with `hasFirstFrame=true` → `planSubscribeRetry` returns `healthy, shouldRetry:false`. So the mid-call audio subscribe has zero retry coverage.

## Required fix (acceptance) — restore retry resilience to the mid-call subscribe path
Make a failed mid-call new-track subscribe RETRY (bounded) until it succeeds, so a transient failure does not permanently drop a peer's mid-call mic/camera. The two-way-audio goal: a peer's mid-call mic-on must reach every subscriber.

VERIFIER-FLAGGED CORRECTNESS CAVEATS (must honor — these are why it's tricky):
1. **Do NOT reuse the camera-frame-poisoned gate.** `nextSubscribeRetry(clientId, subscribeFirstFrameAt.has(clientId))` returns `healthy/shouldRetry:false` once ANY frame (the camera) arrived for that publisher — so reusing `subscribeRetryAttempts`/`subscribeFirstFrameAt` would either never retry (the current bug) or, if forced, retry forever. Use a SEPARATE bounded mid-call retry mechanism (e.g. a dedicated per-publisher-or-per-trackName mid-call attempt counter feeding `planSubscribeRetry` with `hasFirstFrame:false`, with its OWN cap).
2. **Re-derive the tracks to (re)subscribe from ACTUAL subscribed state**, not from `prev.tracks`. On retry, compute "the publisher's announced tracks that are NOT in midToEntry/subscribedTracks" so a later `sfu-presence` that already recorded `audio` still re-subscribes the missing one. The existing `alreadySubscribed`/midToEntry guard prevents double-subscribing a track that actually succeeded.
3. **Cap + backoff, NO infinite loop.** Mirror the join path's cap (`SUBSCRIBE_RETRY_CAP` ~7) and reuse `scheduleSubscribeRetryBackoff`/backoff. After the cap, give up like the join path (log + stop) — do not loop forever.
4. **The retry must drive `doSubscribeTracks` DIRECTLY** (re-enqueue for the failed publisher's missing tracks), because the room.page `subscribeRetryVersion` effect path short-circuits on `subscribedClientIds.has(clientId)`. (If you instead choose to clear the publisher from subscribedClientIds to reuse the join path, be VERY careful not to tear down its already-working camera subscription — re-deriving missing tracks + direct re-subscribe is the safer variant.)

## No regression (critical — this is the riskiest subsystem)
- B06 first-mid-call-track announce + subscribe-any-new-track; B08 join-path stuck-subscribe retry; B19 transactional doSubscribeTracks rollback (S1) + reconcile (S3) + cfSession eviction (S2) + screen rollback (S4); B11 transport recovery; B17-LEAK4 backoff-timer tracking/teardown. The fix must ADD mid-call retry without altering join-path retry, the transactional rollback, or the transport state machine. A successful mid-call subscribe (no failure) must behave EXACTLY as today (no extra subscribes, no churn).
- Must NOT double-subscribe a track that succeeded. Must NOT retry forever. Must NOT retry a track the publisher actually removed.

## Scope guards (MANDATORY — bypass mode)
- FIX2 ONLY (S-MIDCALL). Touch: sfu-client.service.ts (subscribeNewRemoteTracks + a mid-call retry mechanism + teardown of its timers/counters in the existing cleanup paths), sfu-roster-utils.ts ONLY if a pure helper (e.g. a mid-call-retry-decision or a re-derive-missing-tracks helper) improves testability. Plus tests.
- Do NOT touch: the join-path subscribeIfNeeded/doSubscribe retry, doSubscribeTracks transactional internals (call it, don't change its rollback), the transport-recovery state machine, register-first-track, media/recorder/signaling/relay.
- Prefer a PURE testable seam for the retry decision + the missing-track re-derivation. Clear the new mid-call counters/timers in the SAME teardown paths that clear subscribeStuckTimers/backoffTimers (no leak, no fire-after-teardown).

## Deterministic proof
- Unit specs (npx tsx, extend sfu-client.spec.ts): mid-call subscribe failure → retries (bounded) and EVENTUALLY succeeds (assert the track ends up in subscribedTracks/midToEntry); transient-then-success; exhausted-cap → stops (no infinite loop); a SUCCESSFUL mid-call subscribe does NOT trigger extra retries; a track the publisher removed is not retried; no double-subscribe of an already-subscribed track; the new timers/counters cleared on teardown.
- Re-run sfu-client.spec, sfu-mid-reconcile, sfu-roster-utils, remote-audio* specs. `npx tsc --noEmit` ZERO. `npx ng build` green. Deploy DEV (`pm2 restart meet-poc-fe`).
- BE HONEST: real mid-call unmute under transient CF/network failure is JROM's device seat; unit proves the retry mechanism.

## Plan handshake (MANDATORY)
1. Read brief + subscribeNewRemoteTracks + subscribeIfNeeded + doSubscribe + armSubscribeStuckWatchdog + nextSubscribeRetry + planSubscribeRetry + scheduleSubscribeRetryBackoff + the teardown paths (clearAllSubscribeStuckWatchdogs/clearAllSubscribeBackoffTimers) + selectNewRemoteTracks + handleSfuPresence/Roster + the room.page subscribeRetryVersion effect.
2. Reply PROPOSED: the mid-call retry design (the separate counter + cap + backoff, how you re-derive missing tracks, how the retry drives doSubscribeTracks directly, how timers are cleared on teardown, how a success path stays churn-free), test plan, files, risks, complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → tsc 0 → specs → build → deploy DEV → STATUS: DONE. Do NOT commit (3-agent).

## Artifacts (under <run-dir>/validation/FIX2/)
scenarios.md, changes.md (Root Cause + the mid-call-retry design + per-file WHY + honest device-seat note + explicit no-join-path/no-transactional-regression statement), review.md, test-report.md, independent-validation.md. decisions/ entry for the mid-call retry strategy.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-fix2 <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
