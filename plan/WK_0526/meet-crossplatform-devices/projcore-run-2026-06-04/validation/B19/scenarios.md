# B19 Scenarios

## User Report
JROM universal device goal requires Zoom/Meet-style 3-5 party reliability: everyone can hear/see each other, and partial SFU subscribe or screen-publish failures must not corrupt client state into a permanent half-subscribed state.

## Scenarios Covered

### SFU-S1 - Subscribe rollback on renegotiate failure
- Given a subscribe renegotiation early-populates `midToEntry` for ontrack routing.
- When `PUT /api/sfu/renegotiate` rejects after `setRemoteDescription`, reconcile, flush, answer, and local description.
- Then every touched `midToEntry` key is restored exactly to its prior value or deleted if newly added.
- And `subscribedTracks` is restored from the prior snapshot.
- And subscribe retry metadata is restored so the failed attempt does not look healthy.
- And pending local offer rollback is attempted.
- And the error is rethrown for the B08 retry path.

### SFU-S1 - Subscribe success remains committed
- Given a subscribe renegotiation succeeds.
- Then reconciled real mids are present in both `midToEntry` and `subscribedTracks`.
- And no rollback is attempted.

### SFU-S2 - New cfSessionId evicts stale subscription state
- Given a known publisher reconnects with the same `clientId` and a new `cfSessionId`.
- When presence or roster receives the new session.
- Then old mids and subscribe guards for that publisher are evicted before a fresh subscribe can run.

### SFU-S3 - Reconcile guard fails loudly on deterministic drift
- Given CF returns empty remote mids and real mids must be inferred from new transceivers.
- Then unique `trackName`, known kind, and per-kind count parity are enforced.
- And mapping remains positional within each receiver kind.
- Residual limitation: two same-receiver-kind tracks from the same publisher still depend on CF/order because empty mids provide no deterministic discriminator.

### SFU-S4 - Screen publish rollback
- Given screen publish adds a new sendonly transceiver and creates a local offer.
- When `/api/sfu/tracks` fails before publish completes.
- Then pending local offer rollback is attempted, the added sender is detached/stopped, `screenSender` stays clear, and no screen track is appended to local publish state.

## Out Of Scope
- Already-flushed `ontrack` stream/tile/media side effects are not unwound on subscribe failure by instruction. Existing watchdog/tile behavior and the B08 retry path handle any dead track side effects.
- Real 3-5 party multi-device proof remains JROM's seat; unit coverage proves the client state-machine invariants only.
