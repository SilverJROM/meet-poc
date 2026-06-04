# FIX3 Review

## Scope
Touched only:
- `frontend/src/app/services/sfu-client.service.ts`
- `frontend/src/app/services/sfu-client.spec.ts`

## Review findings
- PASS: The filter is inside `doSubscribeTracks()` only.
- PASS: The empty-filter return precedes `subscribeInitiatedAt`, `existingMids`, POST, snapshots, rollback setup, and mutations.
- PASS: `tracksToSubscribe` drives the `kindMap`.
- PASS: `tracksToSubscribe` drives the `/api/sfu/tracks` body.
- PASS: Reconcile receives CF response tracks from the filtered request and a filtered `kindMap`, so response/mid counts stay aligned.
- PASS: Already-subscribed full set is a no-op with no POST or stamp.
- PASS: Double-trigger same-track sequence produces one POST, one added transceiver, and one subscribed entry.
- PASS: Mixed existing/missing list still subscribes the genuinely missing track.
- PASS: FIX2 mid-call retry still reaches subscribed state for a truly missing track.
- PASS: Join retry, FIX2 retry, presence handling, transactional rollback/reconcile internals, and transport recovery were not modified.

## Residual risk
The deterministic tests do not play real audio. JROM's real-device seat remains the final confirmation for no audible doubled/echoed audio.
