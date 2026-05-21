# ws-heartbeat Independent Validation

## Requirement Closure

DR-44 is satisfied:

- Backend sends native WebSocket pings and terminates stale sockets after two missed cycles.
- Backend also sends app-level `heartbeat` messages for browser-observable liveness.
- Heartbeat termination is a drop, not a DR-38 leave; membership/clientKey identity is preserved for reconnect.
- Frontend closes stale signaling sockets with non-leave code `4000` and reuses existing reconnect/resync.
- DR-43 WS health diagnostics include heartbeat miss count and last heartbeat timing.

## Validation Notes

The targeted test directly exercises the high-risk behavior: an admitted socket stops ponging, the backend terminates it, the room enters reconnecting state, and the same participant resumes without re-admit.

