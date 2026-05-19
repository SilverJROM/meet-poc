# v2-B2 Changes

## User Report

Invoke `$lead` for v2-B2. Backend-only: authenticate and bind `/upload` to open meeting sessions, add host-only WebSocket commands, close R1.3 host-end lifecycle, and cover S2.1-S2.9 with tests. Commit before `STATUS: DONE`.

## Root Cause Mechanism

v1 recording upload intentionally accepted unauthenticated local browser uploads and stored files by room metadata only. That could not support admin-only recording, session-bound recordings, or host authority. Signaling also had no server-validated host commands for recording-state broadcast, ending a meeting, soft mute, or hard removal.

## Code Changes

- `backend/src/modules/recording/index.ts`
  - Wrapped `/upload` with `requireAuth`.
  - Validates `X-Room` against a real room, checks room ownership from cookie-derived user, and rejects missing open sessions with `409`.
  - Embeds `meeting_session_id` in new recording filenames.
  - Parses both v2 and v1 recording filename shapes and returns `sessionId: string | null`.
- `backend/src/modules/signaling/index.ts`
  - Added host-only handlers for `recording-state`, `meeting-ended-by-host`, `mute-target`, and `remove-peer`.
  - Broadcasts `recording-started/stopped` to all admitted peers with the host client id and current session id.
  - Closes sessions with `ended_reason='host-end'`, broadcasts `meeting-ended`, rejects pending knockers, closes sockets, and removes the live room.
  - Sends `mute-request` only to the target peer.
  - Sends `peer-removed` to the target peer and lets the close handler broadcast `peer-left`.
  - Logs non-host host-command attempts at info level and otherwise drops silently.
- `backend/tests/recording.test.ts`
  - Updated upload tests for 401/403/409/session-bound success and backward-compatible recording listing.
- `backend/tests/signaling-host-actions.test.ts`
  - Added S2.5-S2.9 real WebSocket tests.
- `backend/tests/sessions-lifecycle.test.ts`
  - Updated S1.3 regression to assert the B2 host-end close path.
- `project_specs.md`
  - Documented the recording auth/session binding and v2 host-authority WS messages.

## Wire-Format Additions

| Direction | Message | Scope |
|---|---|---|
| client → server | `recording-state {state:'started'|'stopped'}` | host only |
| server → admitted | `recording-started {clientId, sessionId}` | broadcast |
| server → admitted | `recording-stopped {clientId, sessionId}` | broadcast |
| client → server | `meeting-ended-by-host` | host only |
| server → admitted | `meeting-ended {reason:'host-end'}` | broadcast |
| client → server | `mute-target {clientId}` | host only |
| server → target | `mute-request {from}` | direct |
| client → server | `remove-peer {clientId}` | host only |
| server → target | `peer-removed {reason:'removed by host'}` | direct |

## Modules Touched

- Backend recording module
- Backend signaling module
- Backend sessions lifecycle tests
- Backend recording and WS tests
- Project architecture docs

## Caveats

- Frontend host controls, host-end recorder flush, and UI recording indicators remain future batch scope.
- Server-side `meeting-ended-by-host` cannot finalize a browser `MediaRecorder`; B8 owns the explicit client flush flow.
- Existing v1 recording filenames remain listable with `sessionId: null`.

## Autonomous Decisions

- Logged `decisions/2026-05-19-v2-b2-meeting-end-close-order.md`: close session/delete live room before closing sockets to prevent close-handler double cleanup.
- Logged `decisions/2026-05-19-v2-b2-upload-auth-before-raw-body.md`: run auth middleware before the 200MB raw body parser.
- Logged `decisions/2026-05-19-v2-b2-recording-parser-longest-match.md`: parse the v2 filename shape before the v1 shape.
