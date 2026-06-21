# Batch B13 Changes

## Branch

`feat/crossplatform-devices-20260604` @ `54a1d38`

## User Report

"speaker/sink failure must never kill playout"

## Root Cause

`RemoteAudioService.applySinkId()` let a selected-speaker `setSinkId()` rejection propagate through remote-audio `Promise.all` batches, so one stale/invalid output device could abort unlock/kickstart/recovery for every other remote audio element. `RoomPage.changeAudioOutputDevice()` also stored the selected output before proving it could be applied.

## Code Changes

- `frontend/src/app/services/remote-audio.service.ts` — Added per-element sink fallback helper that catches selected-speaker failures, clears the stored output id, retries that element on default output, and returns success/failure without aborting sibling playout.
- `frontend/src/app/pages/room/room.page.ts` — Persisted selected speakers only after `applySpeakerDevice()` succeeds, rolled failed selections back to default, and cleared the current selected id on in-call refresh failure.
- `frontend/src/app/services/remote-audio.service.spec.ts` — Added focused bad-sink/default-fallback/clear-storage coverage plus valid-speaker persistence coverage.

## Verification

- PASS: `npx tsx frontend/src/app/services/remote-audio.service.spec.ts`
- PASS: `npx tsx frontend/src/app/services/remote-audio-playability.spec.ts`
- PASS: `npx tsx frontend/src/app/services/remote-audio-watchdog.spec.ts`
- PASS: `npx tsx frontend/src/app/services/feedback-limiter.spec.ts`
- PASS: `npm run build -w frontend`

## Caveats

- VALIDATION LIMITATION: Browser-specific `setSinkId()` behavior for physically unplugged speakers still needs live device hot-unplug validation; the failure mechanism is covered by the focused unit spec.
