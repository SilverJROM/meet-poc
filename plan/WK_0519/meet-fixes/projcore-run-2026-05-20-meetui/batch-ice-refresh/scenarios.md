# Batch ICE Refresh Scenarios

## DR-49.1 ICE config refresh
- Ordinary peer connection creation uses the cached ICE config while it is inside the 12-minute frontend TTL.
- `forceRefresh()` bypasses the frontend cache and starts a fresh `/api/ice-config` request.
- DR-40 peer connection recreation requests forced ICE refresh before constructing the replacement `RTCPeerConnection`.
- If ICE config fetch fails, the call still receives default STUN servers and is not blocked.

## DR-49.2 TURN health self-test
- `/app/diagnostics` exposes an on-demand TURN health check.
- The check fetches fresh ICE config, creates a throwaway relay-only peer connection, opens a data channel, creates an offer, and reports reachable when a relay candidate is gathered.
- Timeout/no relay candidate reports `TURN unavailable` without throwing into the diagnostics page.
- The throwaway peer connection is closed on success, error, and timeout paths.
