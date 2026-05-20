# DR-31 Review

PASS.

- Root mechanism is addressed at the server: reconnect identity no longer depends on the old socket close handler minting a grace ticket before the new socket joins.
- Guests and owners both use the same stable participant identity path.
- `peer-resumed` is authoritative for superseding the old client id; the frontend removes that explicit old peer and does not delete unrelated live peers.
- The fallback identity dedup path only removes peers that are stale/dead/reconnecting.
- The existing 20s ICE recovery path remains local connection-health handling; server reconnect grace drives the visible `Reconnecting…` participant state and expiry removal.
- No mirror or tile-order behavior was changed. Tracking by `participantId` keeps the visible tile identity stable across reconnect.
