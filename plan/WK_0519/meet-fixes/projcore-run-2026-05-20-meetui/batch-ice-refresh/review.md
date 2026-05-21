# Batch ICE Refresh Review

## Scope Check
- DR-49 only.
- No backend files or Cloudflare TURN TTL constants changed.
- DR-40 recovery path now forces fresh ICE before replacement PC creation.
- Existing STUN fallback behavior remains non-blocking.

## Risk Review
- Throwaway TURN health peer connection is closed in `finally`, covering success, error, no-TURN, and timeout outcomes.
- Diagnostics check is on-demand and informational; it does not block calls.
- Ordinary PC creation still uses cached ICE config inside the 12-minute TTL to avoid unnecessary backend fetches.
- Force refresh fetch failure returns STUN for the affected creation path rather than reusing stale credentials.

## Result
PASS. Diff is scoped to frontend ICE config/WebRTC diagnostics plus focused E2E coverage.
