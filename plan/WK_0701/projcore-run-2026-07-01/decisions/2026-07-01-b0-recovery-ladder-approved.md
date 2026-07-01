---
date: 2026-07-01
project: meet-poc
type: panel-consensus
source: projcore
priority: high
search_hooks: [recovery-ladder, escalation, sfu-rejoin, cfSessionId, epoch-guard, 406, prior-art, b0]
---

# B0 recovery-ladder approach APPROVED (codex55 co-planner + Opus)

## Decision
Adopt the 4-rung hybrid escalation ladder inside one recovery coordinator (keyed by {epoch,
publisher}, all PC mutation via enqueue()): same-session retry (3, 250/500/1000ms) → forced
renegotiated subscribe (2, 500/1000ms) → coalesced full local SFU rejoin with fresh cfSessionId
(≤1/15s, ≤2/2min, then 60s low-freq) → visible unrecovered UI. Epoch guard prevents stale in-flight
subscribe responses binding to a rejoined PC. Full rejoin = local transport/session rotation, NOT
leaving the app room. Full spec: deliberation/B0-recovery-ladder/consensus.md.

## Prior-art WIP disposition (resolves JROM's delegated question)
KEEP the publisherMicEnabled healthy-silence guard + the tearDownPeerSubscription cleanup insight
(remove maps/streams even when subscribedClientIds already false). DROP same-cfSessionId-only
resubscribePublisher as terminal + capped mark-stalled as final. The prior-art is salvaged into
B2/B3, not committed as-is.

## Plan adjustments
B4 upgraded medium→high + REDTEAM:standard (Glory hasPc:false was participant-breaking). B1 adds
stale-in-flight-op reproduction. B3 built on B2 coordinator. B6 adds 5-person rejoin coalescing.

## Counterfactual
Retry-only would not clear a poisoned local session (the likely 406 root); immediate-rejoin-on-first-
failure would cause storms + needlessly reset healthy streams. The bounded ladder is the middle path.

## Reasoning
Cross-runtime co-planner (codex55) independently read the code + CF Realtime docs + stack reference;
Opus coordinator reviewed and approved without push-back. Matches north-star #1 (escalate, never
silent give-up) with explicit anti-retry-storm bounds.
