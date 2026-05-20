# DR-29 External Mic Changes

## User Report

JROM reported that built-in/phone microphones work, but a separate/external mic appears to work in device-check while not flowing in-call. The suspected failure mode was that the lobby-selected external mic was not the audio track actually published through the in-call `RTCRtpSender`.

## Root Cause Mechanism

`refreshDevices()` could autopick or restore `selectedAudioId` after the lobby stream had already been acquired. When that first acquisition used default audio, the UI could show a selected external device while `media.localStream()` still held the built-in/default audio track. Join then called `webrtc.configure(stream)`, and `addTrack()` published that stale default track to peer connections.

## Changes

- Added a selected-audio reconciliation step before joining/publishing.
- Reacquires lobby audio only when the current local audio track deviceId differs from the selected mic deviceId.
- Keeps the no-op path clean when the stream already matches the selected mic, avoiding unnecessary `getUserMedia` calls and audio glitches.
- Handles device changes by refreshing the device list and reconciling the selected mic in lobby or in-call.
- On exact `deviceId` acquisition failure, falls back to default audio and updates `selectedAudioId` to the actually acquired track deviceId.
- In-call fallback uses `replaceLocalSenderTrack('audio', track)`, preserving the DR-13 audio sender priority path.
- Moved the `window.__meetDebug.diagnosticSnapshot` helper behind the existing localhost-only debug hook block. Persisted DR-28 diagnostics remain unchanged.

## JROM Real-Hardware Confirmation Needed

JROM should run one real external-mic call and verify:

- The DR-28 diagnostics log shows the external mic deviceId/label on outbound audio sender track info.
- The remote participant can hear the external mic after join.
- Mid-call switch to the external mic updates the DR-28 sender track deviceId/label and remains audible.
