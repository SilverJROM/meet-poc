# M-B5 Changes

## User Report

Invoke `$lead` for M-B5 iOS Safari specifics. Implement MediaRecorder mime capability-list fallback, iOS-safe recorder timeslice behavior, backend extension compatibility for mp4/aac recordings, and graceful mobile landscape orientation audit. Fullscreen helper remains deferred. Commit before `STATUS: DONE`.

## Code Changes

- `frontend/src/app/services/recorder.service.ts`
  - Adds a MediaRecorder capability list: `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4;codecs=mp4a.40.2`, `audio/mp4`, `audio/aac`.
  - Stores the selected mime and extension for upload and debug.
  - Sends `X-Ext` with the selected extension instead of hardcoded `webm`.
  - Calls `MediaRecorder.start()` with no timeslice on iOS; non-iOS remains `start(1000)`.
- `frontend/src/app/pages/room/room.page.ts`
  - Exposes `lastRecordingMime`, `lastRecordingExtension`, `lastRecorderTimeslice`, and `lastRecordingUpload` in `__meetDebug`.
- `backend/src/modules/recording/index.ts`
  - Lists `.webm`, `.mp4`, and `.aac` recording files.
  - Parses recording filenames with any safe alphanumeric extension.
  - Sends download content type based on extension.
- `backend/tests/recording.test.ts`
  - Adds mp4 upload/list/download coverage for `X-Ext: mp4`.
- `frontend/src/app/pages/room/room.page.scss`
  - Adds mobile landscape lobby layout so the preview and join controls fit without portrait lock.
- `frontend/src/app/components/lobby-preview/lobby-preview.component.scss`
  - Adds compact landscape sizing for lobby preview, meter row, and selectors.
- `e2e/tests/v3-mb5-ios/*`
  - Adds deterministic MediaRecorder fallback/timeslice tests with a fake recorder shim.
  - Adds mobile landscape lobby/call visibility audit.

## Mime Candidate List

| Order | Mime type | Extension |
|---:|---|---|
| 1 | `audio/webm;codecs=opus` | `webm` |
| 2 | `audio/webm` | `webm` |
| 3 | `audio/mp4;codecs=mp4a.40.2` | `mp4` |
| 4 | `audio/mp4` | `mp4` |
| 5 | `audio/aac` | `aac` |
| fallback | browser default | `webm` |

## iOS Timeslice Rationale

The iOS branch calls `MediaRecorder.start()` without a timeslice. Non-iOS keeps the existing `1000` ms chunk cadence. This avoids the iOS Safari issue where short MediaRecorder timeslices can produce empty segments.

## Orientation Audit

The 844x390 landscape audit initially caught the lobby preview exceeding the visible viewport. M-B5 adds a landscape-specific two-column lobby layout and compact preview sizing. The call controls and lobby preview now remain within the landscape viewport without locking orientation.

## Screenshots

- `screenshots/mobile-landscape-controls-visible.png`
- `screenshots/mobile-landscape-lobby.png`
