# Fix Ontrack Race Validation

## Files Touched

- `frontend/src/app/services/sfu-client.service.ts`
  - Buffers `pc.ontrack` events when the transceiver mid is not yet present in `midToEntry`.
  - Replays buffered track events after `midToEntry` is populated.
  - Moves remote-subscribe mid reconciliation immediately after `setRemoteDescription()` and before `createAnswer()`.
  - Clears buffered track events during reconnect, exit, and destroy cleanup.

## Race Timeline

During remote subscribe, `setRemoteDescription()` creates the receiving transceivers and queues `track` events. The previous code awaited `createAnswer()` before populating `midToEntry`, which yielded to the event loop. If `ontrack` fired during that yield, the handler saw no entry for the mid and returned, permanently dropping the remote stream event even though RTP bytes were arriving.

## Why This Closes It

`midToEntry` is now populated synchronously immediately after `setRemoteDescription()` returns, before the next awaited WebRTC call. That gives the existing `ontrack` handler the mapping it needs when the browser dispatches the queued track event. The pending-event buffer is defense-in-depth: if timing still slips, the event is retained by mid and replayed as soon as the mapping exists.

## Validation

- `cd backend && npm run build` passed with 0 errors.
- `cd frontend && ng build` passed with 0 errors.
- `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` passed 4/4.
- The connecting-window regression reported `host stuck-warning: false; guest stuck-warning: false`, which is expected if the replay path prevents the stuck subscribe.
