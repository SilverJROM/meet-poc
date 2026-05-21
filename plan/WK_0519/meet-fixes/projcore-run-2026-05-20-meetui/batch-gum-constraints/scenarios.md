# Batch GUM Constraints Scenarios

## DR-48-S1 Audio acquisition requests processing constraints
- Given lobby media preflight requests microphone access
- When an audio input is requested with or without a selected device
- Then getUserMedia receives echoCancellation=true, noiseSuppression=true, and autoGainControl=true
- And the selected microphone still uses deviceId.exact when present

## DR-48-S2 Reacquisition paths preserve the same audio constraint shape
- Given an in-call microphone switch or local microphone recovery
- When MediaService reacquires or replaces the audio track
- Then the request includes EC/NS/AGC=true
- And a vanished exact device still falls back through the existing DR-29/DR-46 fallback path

## DR-48-S3 Diagnostics show actual applied microphone settings
- Given an acquired outbound audio sender track
- When diagnostics snapshots and persisted diagnostics samples are generated
- Then outboundAudio includes the actual track.getSettings() EC/NS/AGC, sampleRate, channelCount, deviceId, and label evidence
- And /app/diagnostics renders the applied microphone settings.
