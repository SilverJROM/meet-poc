# ws-heartbeat Changes

## User Report

Signaling WebSocket can die silently behind NAT/proxy/mobile-doze, leaving the call stuck until the room is manually restarted.

## Root Cause

The app had reconnect/resync behavior after observable WebSocket closes, but no app-level or protocol-level heartbeat. A half-dead TCP/WebSocket path could remain open from the app's point of view, so neither the backend close handler nor the frontend reconnect path would run promptly.

## Changes

- `backend/src/modules/signaling/index.ts`: added native `ws.ping()` heartbeat every 20s with per-socket `isAlive`/miss tracking; stale sockets terminate after two missed cycles. Termination uses `ws.terminate()` only, so admitted peers route through the existing drop/reconnect-grace close handler and do not revoke membership.
- `frontend/src/app/services/ws.service.ts`: added app-observable `heartbeat` handling, last-seen tracking, 45s stale threshold checked every 5s, and proactive stale close using code `4000` plus existing reconnect/backoff.
- `frontend/src/app/services/meeting-sessions.service.ts`: extended `DiagnosticsWsHealth` with heartbeat/liveness fields.
- `frontend/src/app/pages/diagnostics/diagnostics.page.ts`: surfaced heartbeat misses and last heartbeat age in the WS health summary.
- `backend/tests/signaling-helpers.ts` and `backend/tests/signaling-reconnect.test.ts`: added a heartbeat-stale reconnect test with a `ws` client that disables automatic pong.

## Caveats

Autonomous decisions: none.

