# Decision — B2a coordinator scope carve-out + micEnabled gate deferral

**Date:** 2026-07-01
**Batch:** B2a
**Status:** Approved at PROPOSED/APPROVED-PLAN handshake

## Decision

1. Mid-call-subscribe-retry (`scheduleMidCallSubscribeRetry`) and live-mid-conflict-retry
   (`scheduleLiveMidConflictRenegotiationRetry`'s non-conflict fallback) keep their pre-existing flat-cap
   retry logic unchanged for B2a. They gain ONLY the epoch-guard bind-check (shared choke point in
   `doSubscribeTracks`), not the rung-1/rung-2/low-frequency ladder.
2. The new coordinator's `canRunSubscribeRecovery()` gate omits the brief's literal
   `peer.micEnabled !== false` condition.

## Why

- B0 consensus said "ONE recovery coordinator," but B1's actual reproduction (and R2's acceptance
  criteria) targets the initial-subscribe-failure path specifically (`subscribeIfNeeded`'s catch +
  `armSubscribeStuckWatchdog`'s stuck-timeout). Folding the two out-of-scope paths into the full ladder
  now would exceed the atomic-slice estimate and mixes B2a's "kill the permanent-stop cap" concern with
  unrelated mid-call/conflict-retry semantics that aren't broken today. Full convergence is deferred to
  B2b, where the rejoin naturally coalesces all pending publisher failures per consensus anyway.
- `RemotePublisher` (the SFU-roster type `SfuClientService` operates on) carries no mic-enabled field —
  that concept lives only in `room.page.ts`'s `PeerIdentity` model. B2a's failure domain is
  "advertised-but-never-subscribed" (zero audio flowing yet); gating recovery on mic state would be
  actively wrong there since a muted peer still needs its subscribe pipeline established so audio flows
  the instant they unmute. The mic-off "healthy silence" distinction is meaningful for B3's
  subscribed-but-silent stall detection, not this batch.

## How to apply

- B2b: when building rung-3 full rejoin, revisit whether mid-call/live-mid-conflict failures should also
  route through the shared coordinator (coalescing multiple publishers' failures into one rejoin makes
  this more natural there than in B2a).
- B3: wire `peer.micEnabled` into ITS trigger gate (subscribed-but-silent detection), not into B2a's
  `canRunSubscribeRecovery()`.
