# B21b Test Report

## Passed
- `npx tsx frontend/src/app/pages/room/room-decisions.spec.ts`
- `npx tsx frontend/src/app/services/remote-audio.service.spec.ts`
- `npx tsx frontend/src/app/services/remote-audio-playability.spec.ts`
- `npx tsx frontend/src/app/services/remote-audio-watchdog.spec.ts`
- `npx tsx frontend/src/app/services/remote-audio-health.spec.ts`
- `npx tsx frontend/src/app/services/media-toggle.spec.ts`
- `npx tsx frontend/src/app/services/recorder-leaks.spec.ts`
- `npx tsx frontend/src/app/services/active-speaker-leaks.spec.ts`
- `npx ng build` from `frontend/`
- `pm2 restart meet-poc-fe`

## Notes
- `remote-audio.service.spec.ts` logs the expected B13 fallback debug message for the bad selected sink case.
- `npx ng build` completed with existing warnings: unused `DatePipe`, Stencil empty glob, and CommonJS warning for `@mediapipe/selfie_segmentation`.
- PM2 reported `meet-poc-fe` online after restart.
