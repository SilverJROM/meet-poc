# LEAN1 Test Report

## Frontend Typecheck
- PASS: `npx tsc --noEmit` from `frontend/`
- Result: zero errors.

## Frontend TSX Specs
Command: `for spec in $(rg --files src/app -g '*.spec.ts' | sort); do npx tsx "$spec" || exit 1; done`

PASS:
- `src/app/pages/room/room-decisions.spec.ts`
- `src/app/pages/room/room-lifecycle.spec.ts`
- `src/app/pages/room/room-recording.spec.ts`
- `src/app/services/active-speaker-leaks.spec.ts`
- `src/app/services/device-selection.spec.ts`
- `src/app/services/diagnostics-global-flag.spec.ts`
- `src/app/services/diagnostics-prefs.spec.ts`
- `src/app/services/feedback-limiter.spec.ts`
- `src/app/services/ice-config.spec.ts`
- `src/app/services/local-media-recovery.spec.ts`
- `src/app/services/media-acquisition.spec.ts`
- `src/app/services/media-errors.spec.ts`
- `src/app/services/media-screen.spec.ts`
- `src/app/services/media-toggle.spec.ts`
- `src/app/services/media.service.spec.ts`
- `src/app/services/mic-capture-health.spec.ts`
- `src/app/services/mic-energy.spec.ts`
- `src/app/services/mic-selftest.spec.ts`
- `src/app/services/mic-sweep.spec.ts`
- `src/app/services/recorder-leaks.spec.ts`
- `src/app/services/remote-audio-health.spec.ts`
- `src/app/services/remote-audio-playability.spec.ts`
- `src/app/services/remote-audio-watchdog.spec.ts`
- `src/app/services/remote-audio.service.spec.ts`
- `src/app/services/sfu-client.spec.ts`

## Frontend Build
- PASS: `npx ng build` from `frontend/`
- Existing warnings: Stencil empty glob; MediaPipe CommonJS optimization warning.

## Backend Touched Tests
- PASS: `npx vitest run tests/rooms.test.ts tests/sessions-ttl.test.ts tests/signaling-waiting-room.test.ts` from `backend/`
- Result: 3 files passed, 18 tests passed.

## DEV Deploy Restart
- PASS: `pm2 restart meet-poc-fe`
- PASS: `pm2 restart meet-poc-be`
- PASS: follow-up PM2 status showed both `meet-poc-fe` and `meet-poc-be` online.
