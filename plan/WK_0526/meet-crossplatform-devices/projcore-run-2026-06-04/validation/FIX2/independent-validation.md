# FIX2 — Independent Validation (3-agent): mid-call subscribe retry (S-MIDCALL goal-blocking)

**Verdict: SOLID** (projcore + independent 2nd validator OPUS both SOLID). Committed by projcore. Verifier ≠ fixer. Closes the R2-confirmed goal-blocking bug: a peer turning their mic on mid-call could be permanently unheard by a subscriber after a transient subscribe failure.

## Proof re-run by projcore
- `npx tsx` sfu-client + remote-audio*/media-acquisition/recorder-leaks specs pass. `npx tsc --noEmit` app=0 spec=0. `npx ng build` green. DEV pm2 meet-poc-fe restarted.

## Diff review (scope: sfu-client.service.ts + sfu-client.spec.ts; sfu-roster-utils UNMODIFIED; join/rollback/reconcile/transport/B06 untouched)
- Separate keyed mid-call retry state: midCallSubscribeRetryAttempts/Timers keyed clientId∶cfSession∶trackName.
- subscribeNewRemoteTracks → enqueueMidCallSubscribeTracks: re-derives missing via missingAdvertisedRemoteTracks/isTrackSubscribed from ACTUAL subscribed state (midToEntry+subscribedTracks), .then clears keys, .catch → scheduleMidCallSubscribeRetry.
- scheduleMidCallSubscribeRetry: planSubscribeRetry(hasFirstFrame:FALSE — sidesteps the camera-frame poison that caused the bug) + cap SUBSCRIBE_RETRY_CAP + backoff; capped → log + delete timer (no dangling); already-subscribed/duplicate-timer guards.
- retryMidCallSubscribeTrack: stops on publisher-gone / cfSession-mismatch / no-longer-missing; else re-subscribe.
- Teardown: clearAllMidCallSubscribeRetryState in clearLocalTransportSessionState/closeLiveTracksForExit/destroy; clearMidCallSubscribeRetryState(clientId) in tearDownPeerSubscription + cfSession presence/roster sites.

## Independent 2nd validator (opus, adversarial) — SOLID
1) Closes S-MIDCALL: YES (re-derive against actual subscribed state, not presence-prev; success lands audio in subscribedTracks+midToEntry). 2) No infinite loop: cap=7, monotonic counter, terminates. 3) Stop conditions correct. 4) No double-subscribe (isTrackSubscribed+missing guard). 5) Success churn-free (calls===1, maps size 0). 6) No regression (alreadySubscribed superset is strictly more conservative). 7) Teardown complete. 8 new spec cases pass; all 22 service specs pass; tsc app+spec 0/0.

## Minor non-blocking note (no action — opus concurs)
An in-flight doSubscribeTracks rejecting after a transport-recovery reset (clearLocalTransportSessionState, which doesn't clear remotePublishers) can re-create ONE self-correcting retry timer; it's fully guarded by isTrackSubscribed/missingAdvertisedRemoteTracks + the transport-recovery subscribeRetryVersion bump re-drives — identical to the pre-existing join-path subscribeBackoffTimers window. Not a new defect class.

## Honesty
Real mid-call unmute under transient CF/network failure on real devices is JROM's seat; the retry state machine is unit-proven + adversarially traced by 2 opus passes.
