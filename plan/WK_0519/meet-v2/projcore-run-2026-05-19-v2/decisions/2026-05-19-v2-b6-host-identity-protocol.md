# Decision: B6 Host Identity Protocol

## Context

B6 needs a HOST badge on the owner tile. The existing admitted payload only included peer IDs and display names, which is not enough for guests to know which remote peer owns the room.

## Decision

Use an additive backend protocol change:

- `admitted.hostClientId`
- `admitted.peers[].host`

The frontend marks the local peer as host from `isOwner`, and marks remote peers as host from either the peer `host` flag or `hostClientId`.

## Rationale

This keeps host identity server-authoritative and avoids guessing from names or requiring a new client-originated "I am host" message.

## Consequences

Legacy message type names remain unchanged. Strict wire-format tests were updated to include the additive fields.
