# closeLiveTracksForExit Cleanup Fix Validation

## Root Cause

`SfuClientService` is a root singleton, so leaving a room does not recreate the service. `cleanupCall()` calls `closeLiveTracksForExit()`, but that method only cleared publish-side state and a subset of pending subscribe state. It left remote publisher, remote stream, remote screen stream, subscribed-track, retry, and mid maps alive across the next room join.

The visible failure path was:

1. A prior call leaves `remoteScreenStreams` or other subscribe-side state populated.
2. A later room join reuses the same singleton.
3. `room.page.ts` sees `remoteScreenStreams().size > 0`.
4. `anyScreenShareActive()` becomes true.
5. `effectiveCameraOn()` becomes false without a manual share-camera override.
6. The local tile renders an avatar and media-state broadcasts `cam:false`, so other peers can also hide the video even while SFU RTP is flowing.

## Fix Scope

- `frontend/src/app/services/sfu-client.service.ts`
  - `closeLiveTracksForExit()` now clears subscribe-side sets/maps before any early return:
    - `subscribedClientIds`
    - `midToEntry`
    - `subscribeRetryAttempts`
    - `subscribeInitiatedAt`
    - `subscribeFirstFrameAt`
    - `remotePublishers`
    - `remoteStreams`
    - `remoteScreenStreams`
    - `subscribedTracks`
  - Sender handles are nulled defensively as part of the same exit cleanup.

- `e2e/tests/fixloop-banner/multipeer.spec.ts`
  - Added a same-browser-context leave/rejoin regression.
  - The test joins with camera enabled, leaves, rejoins, and verifies the local self-view renders `<video>` instead of `.camera-off-avatar`.

## Validation

- `cd backend && npm run build` - PASS.
- `cd frontend && ng build` - PASS.
- `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/multipeer.spec.ts -g "SFU cleanup" --reporter=line` - PASS, 1/1.
- `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` - PASS, 6/6.
