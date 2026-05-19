# Decision — B4 Peer State Visibility

## Status

Accepted

## Decision

Show each remote peer's `RTCPeerConnection.connectionState` as a compact label inside the tile footer.

## Rationale

R5.4 allows tile presence as a simple indicator, but B4's S4.3 benefits from explicit state. A small label gives both user-visible feedback and stable test evidence without adding a separate diagnostics panel.

## Consequences

- S4.3 waits for `connected` labels on both contexts.
- Failed or disconnected states will be visible in the same tile footer.
