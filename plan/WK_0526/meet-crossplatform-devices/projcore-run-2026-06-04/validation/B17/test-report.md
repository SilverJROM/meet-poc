# B17 Test Report

## Focused Leak Specs

- PASS: `npx tsx frontend/src/app/services/recorder-leaks.spec.ts`
- PASS: `npx tsx frontend/src/app/services/active-speaker-leaks.spec.ts`
- PASS: `npx tsx frontend/src/app/services/sfu-client.spec.ts`
- PASS: `npx tsx frontend/src/app/services/media-screen.spec.ts`

## Regression Specs

- PASS: `npx tsx frontend/src/app/services/remote-audio.service.spec.ts`
- PASS: `npx tsx frontend/src/app/services/remote-audio-watchdog.spec.ts`
- PASS: `npx tsx frontend/src/app/services/remote-audio-health.spec.ts`
- PASS: `npx tsx frontend/src/app/services/remote-audio-playability.spec.ts`
- PASS: `npx tsx frontend/src/app/services/media-acquisition.spec.ts`
- PASS: `npx tsx frontend/src/app/services/media-toggle.spec.ts`
- PASS: `npx tsx frontend/src/app/services/local-media-recovery.spec.ts`

## Build

- PASS: `npx ng build` from `frontend/`
- Warnings observed: existing `DatePipe` unused in `RoomsPage`, Stencil empty glob, Mediapipe CommonJS warning.

## DEV Deploy

- PASS: `pm2 restart meet-poc-fe`
- PM2 reported `meet-poc-fe` online after restart.

