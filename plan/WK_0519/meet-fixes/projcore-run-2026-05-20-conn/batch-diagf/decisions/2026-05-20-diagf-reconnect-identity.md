# DIAGF Decision: Reconnect Identity And Grace

## Decision

Use a two-layer recovery model:

1. Short WebSocket/admission grace on the backend preserves the old admitted slot after transient socket close.
2. Frontend peer reconciliation maps `oldClientId` to the new `clientId` on successful resume and preserves the existing remote stream while the replacement peer connection forms.

## Rationale

The failure mode was not just transport reconnect. It was identity churn: the room treated the old peer as gone and the returning browser as a new client. That caused host re-admission, stale disconnected tiles, and duplicate remote identities. A resume event with both ids lets every participant converge on the new active id without rendering a second peer or tearing down the old tile prematurely.

## Security Boundary

- Owner resume is allowed only when the authenticated owner email matches the grace record.
- Guest resume requires a valid unexpired reconnect token scoped to the room, session, user, and prior client id.
- Explicit leave and host removal bypass grace and remain immediate.

## Alternatives Rejected

- Keeping the same `clientId` across reconnects: larger protocol change and higher collision risk across browser sessions.
- Treating every socket close as leave: preserves old behavior but recreates the reported production failure.
- Making all reconnects owner-like: unsafe for guests and would weaken the admission gate.
