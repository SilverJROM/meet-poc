# Batch DIAG1-A Changes

## User Report

JROM reported that real desktop Chrome/macOS testing produced remote peers stuck at "failed" with frozen video on the same WiFi/LAN, and asked for the top 1-2 fixes that address most connection failures. Approved Batch A covers DR-5 TURN config plumbing and DR-4 ICE-restart auto-recovery only, with a minimal candidate-type console log added before the full Batch B diagnostics UI.

## Root Cause Mechanism

The frontend previously constructed every `RTCPeerConnection` from a hardcoded frontend environment STUN-only list. That meant TURN could not be enabled by dropping runtime credentials into the backend. The WebRTC layer also had no recovery path for a peer that entered `disconnected` or `failed`; after initial offer/answer and ICE candidate exchange, no ICE restart or renegotiation was attempted.

## Code Changes

- `backend/src/modules/ice-config/index.ts`
  - Adds `GET /api/ice-config` support through an Express router.
  - Returns current STUN defaults when no TURN env is set.
  - Fully supports static long-term TURN credentials via `MEET_TURN_URLS`, `MEET_TURN_USERNAME`, and `MEET_TURN_CREDENTIAL`, with fallback `TURN_*` aliases.
  - Ignores incomplete static TURN env to avoid leaking partial config.
  - Adds a clearly marked Cloudflare minted-credential TODO seam keyed by `MEET_CLOUDFLARE_TURN_TOKEN` / `MEET_CLOUDFLARE_TURN_SERVICE_ID`.

- `backend/src/server.ts`
  - Mounts the ICE config router under `/api`.

- `frontend/src/app/services/ice-config.service.ts`
  - Fetches and caches `/api/ice-config`.
  - Falls back to the existing STUN defaults if the endpoint is unavailable or malformed.

- `frontend/src/app/services/webrtc.service.ts`
  - Uses fetched ICE config for new peer connections.
  - Adds per-peer ICE restart state: debounce, cooldown, retry cap.
  - Calls `pc.restartIce()` and sends a new ICE-restart offer over the existing signaling relay.
  - Adds standard deterministic offer-collision handling for glare.
  - Logs state transitions and selected candidate type from `getStats()`.

- `frontend/src/environments/environment.ts`
  - Removes the old hardcoded `iceServers` source so the frontend no longer owns ICE server config.

- `scripts/e2e-webserver.js`, `e2e/playwright.config.ts`
  - Adds env-overridable e2e ports so tests can run when the default backend port is already occupied.

- `backend/tests/ice-config.test.ts`
  - Covers default STUN-only, static TURN, incomplete static TURN, and Cloudflare seam behavior.

- `e2e/tests/v3-diag1-conn/reliability-core.spec.ts`
  - Verifies frontend ICE config fetch/use.
  - Forces failed ICE state via browser-side test instrumentation and verifies `restartIce()`, ICE-restart offer creation, and selected candidate type logging.

## Caveats

- No TURN credentials are hardcoded.
- Cloudflare minting is intentionally a stub/TODO until JROM provides provider-specific details.
- Batch B still owns DR-1, the full DR-2 visible diagnostics panel, and DR-3 WS auto-reconnect.
