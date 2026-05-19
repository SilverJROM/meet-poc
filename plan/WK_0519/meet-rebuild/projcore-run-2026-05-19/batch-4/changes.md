# Batch 4 Changes — Call UI + WebRTC Client

## Summary

- Replaced `frontend/src/app/pages/room-placeholder/` with `frontend/src/app/pages/room/`.
- Added a single `/room/:id` Angular page that owns lobby, connecting, knocking, rejected, error, and in-call states.
- Added call UI components: `tile`, `controls-bar`, `waiting-room-panel`, and `knock-spinner`.
- Added frontend services for `WsService`, `MediaService`, and `WebrtcService`.
- Added B4 Playwright specs under `e2e/tests/b4-call-ui/` for S4.1-S4.8.

## WebRTC Client Architecture

- `WsService` owns the native browser WebSocket lifecycle against relative `/ws`, preserving the B2 legacy wire format.
- `MediaService` owns local `getUserMedia`, mic/camera toggles, `getDisplayMedia`, track cleanup, and screen-share attempt state used by S4.5.
- `WebrtcService` owns a full-mesh `Map<clientId, PeerState>` and creates one `RTCPeerConnection` per admitted remote peer.
- SDP/ICE flow ports the legacy `client.js` pattern:
  - peers listed in `admitted.peers` are added as initiators and create offers;
  - existing peers receiving `peer-joined` create peer records and answer the incoming offer;
  - `signal` relays `{ sdp }` and `{ ice }` payloads unchanged through the B2 backend.
- Remote tile state displays each peer connection state; S4.3 asserts `connected` in both browser contexts.

## ICE / B6 Extension Point

`frontend/src/environments/environment.ts` now defines:

```ts
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // B6 injects coturn TURN servers here via environment substitution.
]
```

B6 should add TURN entries through this environment config rather than editing WebRTC service internals.

## Recording Scope

The Record control is present and disabled with `title="Recording lands in B5"`. No `MediaRecorder`, `/upload`, or mixing code was implemented in B4.

## Screen-Share Test Tradeoff

Playwright fake media reliably covers `getUserMedia`, but not native screen-picker UI. S4.5 stubs `navigator.mediaDevices.getDisplayMedia` with a canvas stream and asserts the call attempt count plus local media state. Runtime code still calls the real browser `getDisplayMedia`.

## Backend Scope

No backend source changes were made. B4 consumes the B2 `/ws` protocol and existing room cap behavior.

## Touched Paths

- `frontend/src/app/pages/room/`
- `frontend/src/app/components/{tile,controls-bar,waiting-room-panel,knock-spinner}/`
- `frontend/src/app/services/{ws,media,webrtc}.service.ts`
- `frontend/src/environments/environment.ts`
- `frontend/src/app/app.routes.ts`
- `e2e/fixtures/rooms.ts`
- `e2e/tests/b4-call-ui/`
- `e2e/package.json`
- `package-lock.json`
