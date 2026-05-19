# M-B5 Review

## Findings

No blocking findings.

## Review Checks

- Recorder mime selection uses a capability list instead of hardcoding mp4.
- Upload `X-Ext` reflects the selected extension.
- Backend list/download now recognizes `.webm`, `.mp4`, and `.aac`.
- Filename parsing no longer assumes `.webm`.
- iOS branch calls `MediaRecorder.start()` without a timeslice; desktop/non-iOS remains `1000`.
- Debug hooks expose enough state for deterministic e2e verification without depending on fake-media track behavior.
- Landscape CSS is scoped to `orientation: landscape` and `max-width: 1023px`.
- Fullscreen helper remains deferred and was not added.
- No WebRTC/signaling behavior was changed.

## Residual Risk

The iOS MediaRecorder behavior is verified with a deterministic fake MediaRecorder and iPhone UA, not a real iPhone. Real-device acceptance in M-B6 remains the final Safari proof point.
