# B19 Test Report

## Focused Tests
- PASS: `npx tsx frontend/src/app/services/sfu-client.spec.ts`
  - Covers SFU-S1 subscribe rollback failure and success.
  - Covers SFU-S2 presence and roster new-cfSession stale eviction.
  - Covers SFU-S3 reconcile drift/duplicate guard cases.
  - Covers SFU-S4 screen publish rollback.

## Required Adjacent Specs
- PASS: `npx tsx frontend/src/app/services/remote-audio-watchdog.spec.ts`
- PASS: `npx tsx frontend/src/app/services/remote-audio-health.spec.ts`
- PASS: `npx tsx frontend/src/app/services/remote-audio-playability.spec.ts`
- PASS: `npx tsx frontend/src/app/services/remote-audio.service.spec.ts`
- PASS: `npx tsx frontend/src/app/services/media-acquisition.spec.ts`
- PASS: `npx tsx frontend/src/app/services/recorder-leaks.spec.ts`
- PASS: `npx tsx frontend/src/app/services/active-speaker-leaks.spec.ts`
- PASS: `npx tsx frontend/src/app/services/media-screen.spec.ts`

## Build
- PASS: `npx ng build` from `frontend/`
- Existing warnings only:
  - `RoomsPage` unused `DatePipe` (known TS3/lean item).
  - Stencil empty glob warning.
  - `@mediapipe/selfie_segmentation` CommonJS optimization warning.

## DEV Deploy
- PASS: `pm2 restart meet-poc-fe`
- PM2 reported `meet-poc-fe` online after restart.

## Notes
- No browser screenshots were produced; this batch is validated by deterministic SFU state-machine unit coverage, build, and DEV restart.
