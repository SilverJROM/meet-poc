# B0 Consensus — Recovery Ladder (APPROVED)

Coordinator (Opus) review of codex55 co-planner verdict → **APPROVED** (no push-back; plan is coherent
and code-grounded). This is the agreed approach baked into B2's PROPOSED and B3's design.

## Agreed recovery approach (the escalation ladder)
Hybrid ladder inside a single **recovery coordinator** in `SfuClientService`, keyed by
`{recovery-epoch, publisherClientId}`, all PC-mutating work through `enqueue()`, coalescing duplicate
triggers, emitting a diagnostics event per rung (`subscribe-retry` · `subscribe-renegotiate` ·
`sfu-rejoin` · `recovered` · `throttled` · `unrecovered-visible`).

**Ladder fires only while:** admitted/in-call with session+participant id · local publish `published`
(or Glory-like publish path) · publisher still in `remotePublishers` · publisher advertises ≥1 audio
track · `peer.micEnabled !== false` (mic-off ⇒ healthy silence, clear stall state).

1. **Same-session subscribe retry** — per publisher. Clear that publisher's sub state, re-run
   `doSubscribeTracks()` for missing advertised tracks. Bound: 3 attempts per
   `{publisher, publisherCfSid, localCfSid, epoch}`, backoff 250/500/1000ms + jitter.
2. **Forced same-session renegotiated subscribe** — `doSubscribeTracks(pub, missing, {forceRenegotiation:true})`
   after clearing sub state. Bound: 2 attempts, backoff 500/1000ms.
3. **Full local SFU rejoin, fresh `cfSessionId`** — local transport/session rotation (NOT leaving the
   app room / WS re-admission). Coalesce ALL pending publisher failures into ONE rejoin. Throttle:
   ≤1 rejoin/15s, ≤2/2min; after that keep call visibly degraded + low-freq recovery every 60s while
   admitted+advertised. 8-step sequence + epoch-guard (see verdict §Full SFU Rejoin Mechanism).
4. **Visible unrecovered state** — actionable recovery UI + diagnostics show current rung/throttle.
   Never a silent latched guard.

**Epoch guard (critical):** every async subscribe/publish/close/renegotiate path captures the recovery
epoch and no-ops its binding if the epoch changed — prevents a stale subscribe response binding to the
new PC after a rejoin. B1 must include a test for this stale-in-flight case.

**Full rejoin reuses existing local mic/cam/screen `MediaService` tracks** (do NOT re-getUserMedia);
announces fresh `sfu-publish` over WS so peers clear stale sub state; then `subscribeAllAdvertisedRemotes()`.

## 406 read
CF (not Express) rejecting the track op — most likely stale/closed remote session or a poisoned
local negotiation state. Recovery does NOT branch by guessed cause; the ladder covers all. B1 must
capture exact CF errorCode/description/status/endpoint + local & remote cfSessionId + track names +
`pc.signalingState`, and whether it was publish vs subscribe, and prove these no longer hit `lastGumError`.

## Prior-art disposition (decides the delegated WIP question)
- **Keep:** `publisherMicEnabled` healthy-silence guard · the "stalled audio escalates from playout
  recovery into subscription recovery" concept · clear-sub-state-before-resubscribe · the
  `tearDownPeerSubscription()` insight that cleanup must remove maps/streams even when
  `subscribedClientIds` is already false (the WIP's removal of the early-return).
- **Drop/rewrite:** same-`cfSessionId`-only `resubscribePublisher()` as the *terminal* answer;
  capped `mark-stalled` as final; unrelated Playwright helper churn; tests asserting cap→mark-stalled
  (replace with escalation-asserting tests).

## Plan adjustments (integrated into implementation-plan.md + queue.md)
- B1: reproduce cap→silent BEFORE fix + add stale-in-flight-op case (old subscribe response after rejoin).
- B2: owns the shared recovery coordinator + focused reducer/service tests (not only Playwright).
- B3: build on B2's coordinator, not an independent resubscribe loop.
- **B4: upgrade medium→HIGH + add [REDTEAM:standard]** (Glory `hasPc:false` was participant-breaking).
- B6: include 5-person coalescing (N advertised-not-subscribed ⇒ ONE full rejoin, not N storms).
- Assignments final: DELIB B0+B2 · REDTEAM elite B2 · standard B3+B4+B6.

STATUS: APPROVED-PLAN
