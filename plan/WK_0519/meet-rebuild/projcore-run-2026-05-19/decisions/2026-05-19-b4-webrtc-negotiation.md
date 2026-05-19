# Decision — B4 WebRTC Negotiation Pattern

## Status

Accepted

## Decision

Use the legacy `client.js` negotiation pattern instead of adding a new perfect-negotiation abstraction.

## Rationale

B2 locked the legacy wire format, and B4's scope is to port the working PoC behavior into Angular. New peers create offers to peers returned in the `admitted.peers` list; existing peers create peer records on `peer-joined` and answer incoming offers. This keeps SDP ordering aligned with the legacy client and avoids a broader protocol change.

## Consequences

- S4.3 validates connected state with two browser contexts.
- More advanced glare handling can be revisited only if future product requirements introduce simultaneous renegotiation cases.
