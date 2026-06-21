# Diagnosis — stale subscription on peer republish/reconnect (real-user bug)

**Date:** 2026-06-20 (Manila). Author: projcore (verifier, mechanism-level). Co-planner: codex55.

## Symptom (measured)
4-way matrix, failing pairs all show `perTrackBytesDelta:0` with the publisher track PRESENT in the subscriber's publisher list. Host log proved host REJOINED mid-setup (two cfSessionId / trackName epochs ~50s apart). Failing pairs were reconnect cases (host→agent, agent→local1, agent→local2).

## Mechanism (code-traced)
- `subscribeIfNeeded()` `frontend/src/app/services/sfu-client.service.ts:165` guards by **clientId only** (line 169: `if (this.subscribedClientIds.has(publisher.clientId)) return;`). No trackName comparison. **NOTE: subscribeIfNeeded appears to be called ONLY from the spec (sfu-client.spec.ts:1668) — the production subscribe trigger is a different path; sonnet must trace the real prod subscribe path (effect over remotePublishers()? doSubscribe callers?).**
- `clearPublisherSubscriptionStateForRetry()` (sfu-client.service.ts:1189) DOES evict `subscribedClientIds` (good) — called on new cfSessionId in `handleSfuPresence` (1109) and `handleSfuRoster` (1132).
- **GAP:** `handleSfuPresence` (1105) only re-subscribes when `samePublisherSession` is TRUE (line 1122-1124 → `subscribeNewRemoteTracks`). On a **reconnect (new cfSessionId), samePublisherSession is FALSE**, so after clearing state the handler does NOT itself re-subscribe — it relies on an external reactive effect over `remotePublishers()` to call the prod subscribe path. If that effect doesn't re-fire (or fires before the roster/presence with the new track lands), the peer is never re-subscribed → 0 bytes.
- Backend broadcasts presence via `sfu-roster` (signaling/index.ts:723) + `sfuPresenceRevision` bump (1133). Verify existing peers actually RECEIVE a presence/roster update when a publisher re-publishes (not just on first join).

## Why it matters (north star)
Real users reconnect (network blip) and device-switch (replaceTrack → possibly new track/cfSession). If existing peers don't re-subscribe to the current track, **they go silent for that speaker on a real call** — exactly JROM's "still broken when we jump on a call" fear. Must NOT close R2–R5 on the barrier matrix alone.

## Fix (owner: sonnet, app) — ordered after grok's barrier proof
1. Trace the production subscribe trigger (the effect/component that drives subscribe from `remotePublishers()`).
2. Ensure: when a publisher's cfSessionId OR audio trackName changes, existing peers EVICT the old subscribed track and SUBSCRIBE the current advertised trackName. (Guard on trackName, not just clientId.)
3. Add a focused regression test: publisher republishes new cfSession/trackName → subscriber ends bound to the CURRENT trackName with inbound bytes rising (not the dead old one).
4. Co-plan with codex55 (it surfaced the pointers); red-team the fix (≥1 panelist) per JROM standing rule.

## Barrier (grok, harness) — running now
Removes churn as a confounder for the MATRIX PROOF (R2–R5 measured): strict stable-membership (same 4 cids ≥10s, bytes flowing, no rejoin) before START_MEASURE_AT. Clean 12/12 here proves the media path works on a stable window; it does NOT absolve the reconnect bug above.
