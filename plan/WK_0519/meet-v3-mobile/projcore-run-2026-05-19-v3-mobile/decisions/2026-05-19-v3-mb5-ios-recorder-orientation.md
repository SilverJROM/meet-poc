# M-B5 Decision — iOS Recorder And Orientation

## Mime Candidate Ordering

Use this ordered MediaRecorder capability list:

1. `audio/webm;codecs=opus` -> `webm`
2. `audio/webm` -> `webm`
3. `audio/mp4;codecs=mp4a.40.2` -> `mp4`
4. `audio/mp4` -> `mp4`
5. `audio/aac` -> `aac`

If none are supported, let the browser choose and default the upload extension to `webm`.

## Timeslice

Use `MediaRecorder.start()` with no timeslice on iOS. Keep `MediaRecorder.start(1000)` on non-iOS.

This preserves the previous chunk cadence where safe while avoiding iOS Safari's short-timeslice empty-segment risk.

## Backend Extension Handling

The upload endpoint already sanitized `X-Ext`, but list and parse logic assumed `.webm`. M-B5 expands list/parse/download handling to safe `.webm`, `.mp4`, and `.aac` recordings.

## Orientation Audit

Do not lock portrait. The first 844x390 audit showed the lobby preview exceeding the viewport, so M-B5 adds a landscape-only two-column lobby layout and compact preview sizing. Call controls already fit landscape after M-B3.

## Fullscreen

Fullscreen helper remains deferred to v3.5 per locked Run 3 scope.
