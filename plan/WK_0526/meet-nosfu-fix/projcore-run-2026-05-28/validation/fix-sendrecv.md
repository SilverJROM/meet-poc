# Fix Sendrecv Direction Validation

## Files Touched

- `frontend/src/app/services/sfu-client.service.ts`
  - Changed publish audio, camera, and screen-share transceivers from `sendrecv` to `sendonly`.

## Asymmetric Bug Timeline

The publisher created audio/video transceivers as `sendrecv`, which gave each transceiver a receiver slot before any remote subscribe happened. In the asymmetric case, Cloudflare could attach incoming subscribed RTP to those existing receiver slots without adding new receive transceivers. The browser decoded RTP, but no new `track` event reached the app, so `remoteStreams` stayed empty and the tile remained CONNECTING.

## Why Sendonly Resolves It

Publishing transceivers are now publish-only. Incoming remote subscriptions must use separate receive transceivers added during the subscribe SDP flow, which causes `setRemoteDescription()` to produce track events. The prior mid reconciliation and buffered `ontrack` replay path can then attach the tracks to `remoteStreams`.

## Validation

- `cd backend && npm run build` passed with 0 errors.
- `cd frontend && ng build` passed with 0 errors.
- `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` passed 4/4.
- The connecting-window regression reported `host stuck-warning: false; guest stuck-warning: false`.
