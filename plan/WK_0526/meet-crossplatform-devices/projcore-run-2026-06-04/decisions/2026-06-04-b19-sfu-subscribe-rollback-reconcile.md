# B19 Decision - SFU Subscribe Rollback and Reconcile Strategy

## Decision
Keep `midToEntry` early population in `doSubscribeTracks()` for ontrack routing, but make the operation transactional on failure by snapshotting exact touched mid entries and `subscribedTracks`.

## Rationale
`setRemoteDescription()` can surface `ontrack` before the subscribe renegotiation network round trip finishes. Deferring `midToEntry` writes until after `PUT /api/sfu/renegotiate` would make early `ontrack` unroutable. The safer fix is to write early, then roll back only the state that this subscribe attempt touched if a later step fails.

## Rollback Boundary
Rollback restores:
- touched `midToEntry` keys to exact prior values or deletion state;
- `subscribedTracks` from the prior snapshot;
- publisher retry metadata snapshot;
- pending local offer through existing `rollbackPendingLocalOffer()`.

Rollback intentionally does not remove stream/tile/media side effects from already-flushed `ontrack` events. That was explicitly scoped out and remains handled by existing media/watchdog layers plus the B08 retry path.

## Reconcile Strategy
Because Cloudflare returns empty mids for remote tracks, deterministic mapping is limited. The helper now validates unique track names, known track kinds, and per-kind count parity, then maps positionally within each receiver kind. Multiple same-receiver-kind tracks from the same publisher still rely on ordering because no stronger signal exists in the CF response.
