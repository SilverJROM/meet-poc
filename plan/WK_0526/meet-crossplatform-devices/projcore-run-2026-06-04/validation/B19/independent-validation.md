# B19 — Independent Validation (3-agent, RISKIEST batch): SFU subscribe correctness S1/S2/S3/S4

**Verdict: SOLID** (projcore + independent 2nd validator both SOLID, maximally skeptical pass). Committed by projcore (3-agent). Verifier ≠ fixer.

## Proof re-run by projcore
- `npx tsx` specs pass: sfu-client (embeds reconcile + roster-utils + 51 B19 S1-S4 assertions), remote-audio-watchdog/health/service, media-acquisition, recorder-leaks, active-speaker-leaks. ✅
- `npx ng build` green. ✅
- DEV: pm2 meet-poc-fe restarted (online).
- Diff grep confirms **B08 nextSubscribeRetry / planSubscribeRetry + B11 transportRecovery state machine NOT touched** (empty result).

## projcore diff review
- **SFU-S1** doSubscribeTracks transactional: snapshots subscribedBefore + per-mid prior state (rememberTouchedMid, before each set) + firstFrame/retry; both paths in try/catch; on failure rollbackSubscribeMutation restores midToEntry per-key (set-prior-if-had / delete-if-not) + subscribedTracks(subscribedBefore) + snapshots + rollbackPendingLocalOffer, rethrows. Early-populate-for-ontrack preserved; subscribedTracks.set(nextSubscribed) only on success. Invariant midToEntry⟷subscribedTracks holds on success AND failure. ✅
- **SFU-S2** new cfSessionId (presence + roster) → clearPublisherSubscriptionStateForRetry(clientId) (evicts midToEntry/pendingOntrack/subscribedTracks/remoteStreams/remoteScreenStreams/clientIds/timers + disarms watchdog) before fresh subscribe; explicit subscribeRetryAttempts.delete for the reconnect counter reset. No stale-mid survival. ✅
- **SFU-S3** reconcile: duplicate-trackName + unknown-kind + bidirectional per-kind count-parity guards; group by receiver-kind; positional-within-kind; per-pair kind validation; completeness check. Cross-kind mismap structurally impossible. Residual (single publisher, 2 same-receiver-kind e.g. camera+screen video) documented — not a B19 regression (old code had same ordering dependency). ✅
- **SFU-S4** doPublishScreen try/catch → rollbackPendingLocalOffer + rollbackAddedScreenTransceiver (replaceTrack(null)+stop) + conditional screenSender=null + rethrow; localPublishState only updated on success. No orphan. ✅

## Independent 2nd validator (sonnet, maximally skeptical) — SOLID
Confirmed: rememberTouchedMid ordering correct (snapshot before overwrite, dedup guard); rollback restores exact prior state; subscribedTracks committed only on success outside try; B08 retry sequence correct (rollback restores baseline → throw → caller .catch() increments — no fight); rollbackPendingLocalOffer guarded by signalingState; early-populate preserved; no-renegotiation path consistent; S2 eviction synchronous before applyRosterSnapshot (no stale survival); S3 bidirectional parity catches CF drift, audio+video common case correct, mis-ordered response maps correctly by receiver-kind; S4 four postconditions verified; B06/B08/B11 untouched.

## Non-blocking (logged for LEAN1)
- S1 rollback condition `if (previous.hadEntry && previous.entry)` would fall to delete-branch if a mid had `hadEntry=true` but `entry===undefined`. Impossible with current Map usage (midToEntry never stores null/undefined), but fragile-by-construction — tighten to `if (previous.hadEntry)` in LEAN1. Ant-size hardening, not a bug.

## Honesty
Real 3-5-party multi-device all-hear-all + real partial-failure recovery is JROM's seat — unit proves the state-machine invariant, not the live CF SFU. Not claimed multi-party-proven by e2e.
