# DR-46 Device Recovery Changes

## User Report

JROM's external-device class: when an active mic track ended or stayed muted, the app showed "Microphone disconnected. Please refresh to rejoin." Camera track end was not handled, leaving a dead local/video sender path instead of recovering or cleanly turning camera off.

## Root Cause Mechanism

`RoomPage.attachLocalTrackFailureHandlers()` only attached failure handling to the audio track. The audio handler immediately marked mic off, broadcast muted state, and presented refresh-as-remedy. It did not enumerate devices, reacquire a replacement track, or reuse `replaceLocalSenderTrack`. Video tracks had no equivalent `onended`/`onmute` handler, so camera hot-unplug could leave local state and outbound senders stale.

## Changes

- Added local audio and video `onended`, debounced `onmute`, and `onunmute` handling.
- Added current-track guards so stopping old tracks during replacement does not trigger false recovery.
- Added capped recovery attempts with small backoff.
- Mic recovery enumerates current devices, tries selected mic if still present, falls back to default/next available mic, then uses `media.replaceAudioTrack(..., replaceLocalSenderTrack('audio'))`.
- Camera recovery enumerates current devices, tries selected camera if still present, falls back to default/next available camera, then uses `media.replaceVideoTrack(..., replaceLocalSenderTrack('video'))`.
- If no mic is available after capped retries, the audio sender is replaced with `null`, the dead audio track is removed, and a single no-mic note is shown.
- If no camera is available after capped retries, the video sender is replaced with `null`, the dead video track is removed, camera state is broadcast as off, and a single no-camera note is shown.
- Successful recovery updates selected-device signals and persists only the successfully acquired device id.
- The default "refresh to rejoin" notice was removed.

## Guardrails

- DR-13 preserved: replacement flows through `replaceLocalSenderTrack`, which reapplies sender preferences.
- DR-29 preserved: selected-device reconciliation and fallback semantics remain intact.
- DR-34 preserved: no audio output sink routing changes.
- No peer connection recreation, renegotiation policy changes, admit changes, identity changes, or reconnect changes.

## Autonomous Decisions

None.
