# DR-37 Review

## Scope Check
- Implements only durable per-browser identity foundation.
- Preserves existing waiting-room/admit policy for returning known participants after reconnect grace expiry.
- Reuses DR-31 `peer-resumed` only when the old peer is still active or in reconnecting grace.
- Does not change card-removal, stability, video, audio, or TURN behavior.

## Risk Review
- Room-scoped map is in-memory and is deleted with `liveRooms.delete(roomId)` when the meeting ends, matching POC scope.
- `clientKey` is bounded to 128 characters and ignored if absent/invalid, preserving legacy clients.
- Unknown clientKey still creates a new participantId.
- Existing reconnect token flow remains higher-specificity for tokened resumes; clientKey adds a fallback durable browser identity.

## Evidence
- Backend suite passed: 126 passed, 1 skipped.
- Build passed.
- Isolated 48xx Playwright identity spec passed with `/tmp/meet-poc-identity.sqlite`.
- PM2 restart verified no `MEET_DB_PATH` or `MEET_RECORDINGS_DIR` leak.
