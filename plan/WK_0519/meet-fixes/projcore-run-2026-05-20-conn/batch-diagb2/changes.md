# DIAGB2 Changes

## User Report
JROM requested the final reliability/observability batch: DR-1 screen-share macOS-permission helper, DR-2 per-peer diagnostics plus FORCE-RELAY toggle, and DR-3 WebSocket auto-reconnect with backoff, resync, and stale-peer cleanup.

## Root Cause / Mechanism
- DR-1: display-media permission failures were surfaced only as raw status text, with no macOS Screen Recording restart guidance.
- DR-2: Batch A logged selected candidate type, but the app had no visible per-peer connection diagnostics and no definitive force-relay path to prove TURN fixes cross-network failures.
- DR-3: `WsService` was one-shot. A closed socket only flipped disconnected state. Reconnects created a new backend `clientId`; owners could auto-admit, but admitted guests were forced back to pending because the backend had no scoped resume proof.

## Code Changes
- `frontend/src/app/services/ws.service.ts`: added reconnect state, exponential backoff, debug drop hook, transition logging, and resend-on-open semantics.
- `backend/src/modules/signaling/index.ts`: added opt-in short-lived reconnect tokens for previously admitted clients only; legacy join wire shape remains unchanged when clients do not opt in.
- `frontend/src/app/pages/room/room.page.*`: added screen-share helper, diagnostics panel, force-relay UI, reconnect resync handling, stale peer cleanup, and `__meetDebug` hooks.
- `frontend/src/app/services/webrtc.service.ts`: added peer diagnostics state, selected candidate type storage, force-relay persistence, relay-only PC config, and bounded remote PC recreation.
- `frontend/src/app/components/controls-bar/*`: added a diagnostics toggle control.
- `backend/tests/signaling-reconnect.test.ts`: covers admitted guest resume and bogus-token non-bypass.
- `e2e/tests/v3-diagb2-conn/diagb2-conn.spec.ts`: covers DR-1, DR-2, and DR-3 browser flows.

## Caveats
- Force relay requires valid TURN credentials from `/api/ice-config`; the UI can force `iceTransportPolicy: 'relay'`, but media can only connect if relay servers are available.
- Reconnect tokens are in-memory, short-lived, and scoped to the current live room session. A full page/server restart or ended room intentionally requires normal admission again.
