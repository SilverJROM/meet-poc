# Batch DIAGI Scenarios

## DR-25 Device Switching

1. In the lobby, choosing a different microphone requests that exact `audioinput` device and updates the live local audio track.
2. In the lobby, choosing a different camera requests that exact `videoinput` device and updates the live local video track.
3. On mobile, picker-selected cameras send `deviceId` without `facingMode`; the front/back flip sends `facingMode` without stale `deviceId`.
4. In-call device settings hot-swap the microphone via `replaceTrack` without disconnecting peers.
5. In-call device settings hot-swap the camera via `replaceTrack` without disconnecting peers.
6. Mic swap preserves the DR-13 invariant: audio sender priority and networkPriority remain `high`.

