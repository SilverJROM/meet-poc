# B19 Review

## Scope Review
- Touched only approved implementation files:
  - `frontend/src/app/services/sfu-client.service.ts`
  - `frontend/src/app/services/sfu-mid-reconcile.ts`
  - `frontend/src/app/services/sfu-client.spec.ts`
- Did not touch B08 `nextSubscribeRetry` decision logic.
- Did not rewrite B11 transport recovery state-machine logic.
- Used existing `rollbackPendingLocalOffer()` only as approved.

## Requirement Review
- SFU-S1: PASS. `doSubscribeTracks()` now restores exact touched `midToEntry` prior values, restores `subscribedTracks`, restores publisher retry metadata, attempts PC rollback, and rethrows on post-SRD failure.
- SFU-S2: PASS. Same-client new-cfSession presence and roster paths call the existing per-client eviction helper before fresh subscribe state can be used.
- SFU-S3: PASS. Reconcile validates unique track names, known kinds, and per-kind count parity, then maps positionally within each receiver kind.
- SFU-S4: PASS. Failed screen publish attempts local-offer rollback, detaches/stops added screen transceiver, clears `screenSender`, and leaves local publish tracks unchanged.

## Residual Risk
- Already-flushed `ontrack` stream/tile side effects are intentionally not unwound per approved scope.
- Same-receiver-kind ambiguity remains when CF returns empty mids for multiple same-kind tracks from the same publisher; only order within that kind is available.
- Live 3-5 party subscribe correctness still needs real-device/JROM verification.
