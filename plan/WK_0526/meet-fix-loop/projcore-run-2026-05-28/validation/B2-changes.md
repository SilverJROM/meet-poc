# B2 Changes

## Files Touched
- `frontend/src/app/pages/room/room.page.ts`
- `frontend/src/app/services/sfu-client.service.ts`
- `plan/WK_0526/meet-fix-loop/projcore-run-2026-05-28/validation/B2-changes.md`

## What Changed
- Reduced the admitted-handler audio-publish poll deadline from 5000ms to 1500ms.
- Added a private per-publisher subscribe-stuck watchdog that logs one `console.warn` after 10s without a real `pc.ontrack`.
- Removed the subscribe-response fallback that previously set `subscribeFirstFrameAt` after mids were reconciled.
- Cleared stale watchdog timers on cfSession change, peer subscription teardown, reconnect reset, normal exit teardown, and service destroy.

## Why
- R5 needs the perceived CONNECTING window tightened because lobby preflight should already have a live audio track before join.
- R6 needs `subscribeFirstFrameAt` to mean a real track arrived, not just that the subscribe response completed, so a true no-ontrack stuck state remains observable.

## Watchdog Trace
- arm -> fire: `subscribeIfNeeded` passes self/already-subscribed/no-tracks guards, marks `subscribedClientIds`, arms the timer, and logs after 10s if no first `ontrack` was recorded.
- arm -> disarm-by-ontrack: `pc.ontrack` sets `subscribeFirstFrameAt` the first time a publisher track arrives, then clears that publisher's timer.
- arm -> disarm-by-reset: cfSession change, peer teardown, reconnect reset, normal exit teardown, and destroy clear stale timers before they can report obsolete state.

## Self-Verification
- Command: `cd /home/agjrom/websites/meet-poc/frontend && ng build`
- Result: PASS. Angular build completed with 0 errors. The build emitted the existing Stencil `empty-glob` warning from `node_modules/@stencil/core/internal/client/index.js`; no new B2 warning was emitted.

## Manual Code Review
- Confirmed watchdog arming is inside `subscribeIfNeeded` after all early returns and before `enqueue(() => this.doSubscribe(publisher))`.
- Confirmed `subscribeFirstFrameAt.set(...)` now appears only in `pc.ontrack`, and the watchdog is disarmed inside that same first-track guard.
