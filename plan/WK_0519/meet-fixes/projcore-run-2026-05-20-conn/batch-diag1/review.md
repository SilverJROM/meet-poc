# Batch DIAG1-A Review

## Scope Check

Implemented only Batch A scope:

- DR-5 TURN config plumbing.
- DR-4 ICE-restart auto-recovery.
- Approved amendment: minimal selected-candidate-type console logging.

Deferred as requested:

- DR-1 screen-share helper.
- DR-2 full per-peer diagnostics panel.
- DR-3 WebSocket reconnect/resync.

## Risk Review

- TURN credentials are read only from environment variables and are never committed.
- Default runtime behavior remains STUN-only.
- Backend static TURN path is concrete for Metered-style long-term credentials.
- Cloudflare minted credentials are behind an explicit seam with a TODO instead of an invented provider call.
- ICE restart uses the existing signaling relay and does not require backend wire-format changes.
- Restart retries are capped and debounced to avoid repeated renegotiation loops.
- Offer collision handling is deterministic per peer id and prevents unsafe impolite collisions from being applied.

## Out-of-Scope Changes

The only support change outside product runtime code is e2e port configurability. This was needed because the default backend port `4720` was already occupied during verification.
