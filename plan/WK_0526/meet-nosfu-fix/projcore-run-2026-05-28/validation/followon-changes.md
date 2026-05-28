# Follow-on Publish Stall Fix

## Files Touched

- `frontend/src/app/services/sfu-client.service.ts`
  - Adds a 6000ms timeout helper for SFU HTTP calls.
  - Wraps queued SFU `post`/`put` requests for session creation, track publish/subscribe, track update/close, and renegotiation.
  - Resets `opQueue` in `closeLiveTracksForExit()` and `destroy()`.

- `frontend/src/app/pages/room/room.page.ts`
  - Shows the existing action notice when SFU publish fails after admission.

## Why the Queue Reset Matters

`SfuClientService` is an app-wide singleton. If an enqueued operation hangs, future SFU operations chain behind that unresolved promise. Resetting `opQueue` during teardown makes the next room entry start from a clean queue even if the previous room left a pending operation behind.

## Validation

- `cd backend && npm run build` passed with 0 errors.
- `cd frontend && ng build` passed with 0 errors.
- `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` passed 4/4.
