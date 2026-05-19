# v2-B8 Changes

## User Report

Invoke `$lead` for v2-B8, the final Run 1 batch. Implement the participant sidebar, host mute/remove actions, host leave/end meeting UX with recording flush, non-host meeting-ended toast, and active-speaker highlight. Commit before `STATUS: DONE`.

## Code Changes

- `frontend/src/app/components/participant-sidebar/*`
  - Replaces the old floating waiting-room panel.
  - Shows admitted participants under "In the call" and host-only knockers under "Waiting to join".
  - Adds host-only kebab actions for non-self rows: Mute participant and Remove from meeting.
- `frontend/src/app/components/controls-bar/*`
  - Adds the participant sidebar toggle with admitted count and waiting badge.
- `frontend/src/app/components/leave-dialog/*`
  - Adds the host-only leave dialog with End meeting for everyone, Leave but keep meeting going, and Cancel.
- `frontend/src/app/components/meeting-ended-toast/*`
  - Adds the non-host meeting-ended modal with OK and 5-second countdown.
- `frontend/src/app/services/active-speaker.service.ts`
  - Adds 8 Hz active-speaker sampling for remote streams.
  - Uses Web Audio RMS at a -40 dBFS floor, with track-processor / inbound-stats fallbacks for Chromium remote-track sampling gaps.
  - Exposes `__meetDebug.activeSpeakerHz` for S8.9.
- `frontend/src/app/pages/room/*`
  - Wires participant sidebar, host actions, host leave flow, end-for-all recording flush, meeting-ended toast, and active-speaker tile state.
  - Deletes the old waiting-room panel usage.
- `frontend/src/app/services/media.service.ts`
  - Adds idempotent `muteMic()` for host mute requests.
- `frontend/src/app/services/ws.service.ts`
  - Adds B8 frontend wire types for `mute-request`, `peer-removed`, `meeting-ended`, `mute-target`, `remove-peer`, and `meeting-ended-by-host`.
- `e2e/tests/v2-b8-sidebar/*`
  - Adds B8 Playwright scenarios S8.1-S8.9.
  - Updates B6/B7 helper selectors to open the new participant sidebar reliably.

## Sidebar Contents

| Section | Host sees | Guest sees |
|---|---|---|
| In the call | All admitted peers, HOST badge, mic/cam icons, kebab actions on non-self rows | All admitted peers, HOST badge, mic/cam icons, no kebab actions |
| Waiting to join | Knockers with Admit / Reject | Not rendered |

## End-For-All Flow

1. Host clicks Leave.
2. Host chooses End meeting for everyone.
3. Buttons disable and "Finalizing meeting..." displays.
4. If recording is active, the client stops `MediaRecorder` and uploads the blob with an 8s timeout.
5. Client sends `{type:'meeting-ended-by-host'}`.
6. Client waits 1s, closes the call, and navigates to `/app/rooms`.
7. Non-hosts receive `meeting-ended`, see the toast, and navigate on OK or after 5s.

If the host tab closes during step 4, the partial blob can still be lost. This is accepted in R8.5 because the browser owns the recorder.

## Active-Speaker Throttle Proof

- The sampler uses `setInterval(125)` for an 8 Hz cadence.
- S8.9 asserts `__meetDebug.activeSpeakerHz` is between 6 and 10.
- The tile receives `.is-speaking` only when the selected remote peer exceeds the RMS threshold.

## Caveats

- No backend changes were made; B8 reuses B2 host-action WS commands.
- Chromium headless produced live but zero-sample remote WebRTC audio tracks. The production path still samples real remote streams; the test uses a localhost-only debug injection to feed deterministic audio into the same active-speaker service and tile binding.
