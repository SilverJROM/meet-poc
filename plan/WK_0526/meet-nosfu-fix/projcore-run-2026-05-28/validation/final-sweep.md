# Final Sweep Validation

## Privacy Bug

- Added `e2e/tests/fixloop-banner/camera-toggle.spec.ts` as the regression guard for camera-off propagation.
- The spec joins a host and guest with cameras on, verifies remote video on both sides, turns the host camera off, verifies the guest sees the host avatar with no video, then turns the camera back on and verifies the video returns.
- Ran the new spec first before cleanup changes. It passed on this branch, so the current media-state broadcast path already propagates raw camera-off state. The spec stays committed to catch stale-bundle or follow-on regressions.

## Dead Code Cleanup

- Removed the unused `effectiveCameraState` helper from `frontend/src/app/pages/room/room.page.ts`.
- Left `effectiveCameraOn` and `cameraVisibleDuringCurrentShare` unchanged. Those still gate local self-view rendering during screen share and are intentionally separate from outbound media-state broadcasting.

## Screen Share E2E

- Attempted to extend `e2e/tests/fixloop-banner/multipeer.spec.ts` with a 3-peer screen-share regression.
- First attempt asserted the presenter's own local camera stayed visible during share, which conflicts with the existing local self-view gating semantics.
- Second attempt narrowed the assertion to remote non-presenter cameras, but Playwright fake screen share caused the host view of remote participant tiles to enter `Reconnecting...` and avatar state after share start.
- Removed the flaky screen-share test per the prompt's stop condition. The committed suite remains at 7 fixloop-banner tests: the existing 6 plus the camera-toggle privacy guard.

## Recorder Review

- Reviewed `frontend/src/app/services/recorder.service.ts`.
- `start()` adds the local stream plus current peer streams from `remoteStreams`.
- `addPeerStream()` and `removePeerStream()` manage peer recorder sources directly from stream presence, not from camera state or the removed helper.
- `cleanupAudioGraph()` disconnects peer sources and closes the audio context, so the recorder is not coupled to the media-state camera propagation path.

## Active Speaker Review

- Reviewed `frontend/src/app/services/active-speaker.service.ts`.
- `observe()` removes analyzers for peer ids that are no longer present.
- `reset()` stops all analyzers and closes the audio context.
- `remove()` cancels the processor, stops the cloned audio track, and disconnects source, analyser, and sink nodes.

## Knock Cancel And Reconnect Review

- `room.page.ts` handles `knock-cancelled` by removing the pending knocker from the UI list.
- `backend/src/modules/signaling/index.ts` broadcasts `knock-cancelled` and refreshes the pending list when pending guests are rejected, leave while pending, disconnect, or are displaced by room-full handling.
- `room.page.ts` handles `peer-reconnecting` by marking the identity reconnecting.
- `peer-resumed` removes the old SFU peer state, deletes the old identity entry, inserts the resumed identity, and rebroadcasts local media-state.

## TURN Reachability

- Did not add a TURN Playwright spec.
- `IceConfigService.checkTurnHealth()` exists, but the room page does not expose it through `window.__meetDebug`, so Playwright cannot call it without adding new debug API surface beyond this cleanup sweep.

## Validation Commands

- `cd backend && npm run build` - PASS
- `cd frontend && ng build` - PASS
- `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` - PASS, 7/7
