# Broadcast Camera-State Decoupling Validation

## Root Cause

`broadcastMediaState()` was sending `cam: this.effectiveCameraState(cam)`. That reused the local self-view gating rule for the network-visible camera state.

The two states mean different things:

- Local self-view gating decides whether this client should hide its own camera tile while a screen share layout is active.
- Media-state broadcast tells other peers whether this client is publishing camera video and whether their tile should render a `<video>`.

When `anyScreenShareActive()` became true for any reason, `effectiveCameraState()` could force `cam:false` even while the client was still publishing camera video and other peers were decoding frames. Other clients then stored `camEnabled:false` and rendered avatars instead of the flowing video.

## Fix Scope

- `frontend/src/app/pages/room/room.page.ts`
  - `broadcastMediaState()` now sends the raw `cam` argument.
  - `effectiveCameraOn` and `cameraVisibleDuringCurrentShare` were not changed.
  - Local self-view hiding during screen-share remains a local UI decision only.

## Code Review

- Exactly one code line changed in `broadcastMediaState`: `cam: this.effectiveCameraState(cam)` became `cam`.
- `effectiveCameraState` is now unused in `room.page.ts`; left in place intentionally for a follow-up cleanup to keep this commit minimal.

## Validation

- `cd backend && npm run build` - PASS.
- `cd frontend && ng build` - PASS.
- `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` - PASS, 6/6.
