# v2-B5 Scenarios Implemented

## S5.1 Lobby Pre-Grants getUserMedia

Implemented. The lobby calls media preflight as soon as room existence is confirmed and state reaches `lobby`. `window.__meetDebug.localStream` exposes the stream.

Evidence:
- `e2e/tests/v2-b5-lobby/lobby-preflight.spec.ts`
- `screenshots/lobby-camera-off-preview.png`

## S5.2 Mic Level Meter Shows Activity

Implemented. `MediaService.getMicLevel` samples audio RMS at 8 Hz and the lobby renders an 8-bar meter.

Evidence:
- `e2e/tests/v2-b5-lobby/lobby-mic-meter.spec.ts`

## S5.3 Device Selector Populates

Implemented. After media grant, the lobby enumerates media devices and renders microphone/camera selectors.

Evidence:
- `e2e/tests/v2-b5-lobby/lobby-device-selector.spec.ts`

## S5.4 Permission Denied State

Implemented at B5 placeholder level. A denied preflight shows a microphone access error and Retry button. Retry re-runs preflight in place.

Evidence:
- `e2e/tests/v2-b5-lobby/lobby-permission-denied.spec.ts`
- `screenshots/lobby-permission-denied.png`

## S5.5 Join Carries Pre-Acquired Stream

Implemented. Join reuses the active lobby stream, and the B5 test confirms the track IDs before and after entering the call match.

Evidence:
- `e2e/tests/v2-b5-lobby/lobby-stream-carries.spec.ts`

## Additional Screenshot Coverage

The B5 suite also captures the camera-on preview state after toggling the lobby camera checkbox:

- `screenshots/lobby-camera-on-preview.png`
