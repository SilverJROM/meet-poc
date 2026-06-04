# FIX3 — Independent Validation (3-agent): doSubscribeTracks idempotency (DOUBLE-SUBSCRIBE doubled-audio)

**Verdict: SOLID** (projcore + independent 2nd validator OPUS both SOLID). Committed by projcore. Verifier ≠ fixer. Closes the R3-found regression (FIX2-widened): default-muted-join → unmute caused doubled/echoed audio via a double-subscribe.

## Proof re-run by projcore
- `npx tsx` sfu-client + remote-audio* + media-acquisition + recorder-leaks specs pass. `npx tsc --noEmit` app=0 spec=0. `npx ng build` green. DEV pm2 meet-poc-fe restarted.

## Diff review (contained to sfu-client.service.ts doSubscribeTracks + spec)
- Line 1574-1575: `tracksToSubscribe = tracks.filter(t => !isTrackSubscribed(publisher.clientId, t.trackName)); if (!tracksToSubscribe.length) return;` — positioned BEFORE subscribeInitiatedAt(1577) / existingMids(1595) / POST(1597) / transactional snapshots(1628+). kindMap(1592) + /api/sfu/tracks body(1599) use tracksToSubscribe → reconcile inputs (responseTracks/kindMap/newTransceiverMids) all from the same subset → count parity holds. Nothing else touched.

## Independent 2nd validator (opus, adversarial) — SOLID
1) Stops double-subscribe: op#1 commits midToEntry+subscribedTracks (serialized via opQueue); op#2's filter → empty → early return → no 2nd POST/transceiver. Spec: 1 POST, 1 receive-transceiver, 1 entry. 2) Early-return precedes all stamp/snapshot/mutation/POST (deduped no-op mutates nothing; spec asserts subscribeInitiatedAt.has===false + maps unchanged). 3) Reconcile consistent for the subset incl MIXED already+missing call (POST body only missing track; old entry preserved; new reconciled). 4) Genuine missing track still subscribes — join path + FIX2 retry pass the filter; S-MIDCALL stays closed (FIX2 retry spec: not_found→retry→success). 5) B19 rollback symmetric (filter before snapshots), reconcile/eviction/B06/B08/FIX2/transport intact. 6) NO stale-skip: transport recovery + clearPublisherSubscriptionStateForRetry + tearDownPeerSubscription all purge BOTH maps before re-subscribe → filter never wrongly blocks a needed re-subscribe. 7) all specs + tsc app/spec 0/0.

## Honesty
Real default-muted-join→unmute no-echo on real devices is JROM's seat; the idempotency + reconcile-consistency + no-stale-skip are unit-proven + adversarially traced by 2 opus passes.
