# ws-heartbeat Review

## Scope Review

- DR-44 only: heartbeat, stale termination, frontend liveness, DR-43 diagnostics fields.
- Explicit leave semantics unchanged: only `msg.type === 'leave'` calls `revokeClientIdentity`.
- Heartbeat server termination calls `ws.terminate()` and relies on the existing `close` handler, which starts reconnect grace for admitted peers.
- Client stale close uses code `4000` and reason `heartbeat stale`, not the DR-38 explicit-leave message path.
- No media, admit policy, room capacity, TURN, WebRTC negotiation, or mobile-cap logic changed.

## Risk Review

- Backend timer is scoped to `attachSignaling`, unref'd, and cleared when the server/WebSocketServer closes.
- Browser liveness does not rely on observing protocol pong, which browsers do not expose.
- Thresholds are conservative: server requires two missed pongs; client waits 45s since last inbound message/heartbeat before forcing reconnect.

