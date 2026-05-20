# Batch DIAG1-A Scenarios

Scope: Batch A only, covering DR-5 and DR-4 plus the approved minimal selected-candidate console log. DR-1, DR-2 full panel, and DR-3 are deferred to Batch B.

## DR-5 ICE Config

- **DIAG1-A.1 Default STUN-only:** with TURN env vars unset, `GET /api/ice-config` returns the two existing Google STUN servers and no TURN credentials.
- **DIAG1-A.2 Static TURN credentials:** with `MEET_TURN_URLS`, `MEET_TURN_USERNAME`, and `MEET_TURN_CREDENTIAL` set, `GET /api/ice-config` includes a Metered-style `{ urls, username, credential }` TURN entry.
- **DIAG1-A.3 Incomplete TURN env:** partial static TURN env is ignored, preserving STUN-only behavior and avoiding partial credential leaks.
- **DIAG1-A.4 Cloudflare seam:** Cloudflare TURN env names are recognized, but the exact mint call is intentionally stubbed until JROM provides provider details.
- **DIAG1-A.5 Frontend consumption:** browser peer connections are created with ICE servers fetched from `/api/ice-config`, not `environment.iceServers`.

## DR-4 ICE Restart

- **DIAG1-A.6 Failed/disconnected recovery:** a peer `connectionState` or `iceConnectionState` transition to `failed` or `disconnected` schedules a debounced ICE restart.
- **DIAG1-A.7 Renegotiation:** restart calls `pc.restartIce()`, creates an ICE-restart offer, and sends it through the existing `{ type: 'signal', data: { sdp } }` relay.
- **DIAG1-A.8 Glare control:** inbound colliding offers use deterministic polite/impolite handling and ignore only unsafe collisions.
- **DIAG1-A.9 Retry cap:** each peer is capped at three restart attempts with cooldown/debounce to avoid thrash.
- **DIAG1-A.10 Minimal TURN confirmation:** selected candidate type is read from `getStats()` and logged as `host`, `srflx`, or `relay`.
