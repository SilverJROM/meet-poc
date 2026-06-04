# B21a Test Report

## PASS
- `npx tsx frontend/src/app/pages/room/room-decisions.spec.ts`
- `npx tsx frontend/src/app/services/media.service.spec.ts`
- `npx tsx frontend/src/app/services/media-acquisition.spec.ts`
- `npx tsx frontend/src/app/services/media-toggle.spec.ts`
- `npx tsx frontend/src/app/services/device-selection.spec.ts`
- `npx tsx frontend/src/app/services/local-media-recovery.spec.ts`
- `cd frontend && npx ng build`
- `pm2 restart meet-poc-fe`

## Build Warnings
- Existing Angular warning: `DatePipe` unused in `RoomsPage`.
- Existing Stencil empty glob warning.
- Existing MediaPipe CommonJS optimization warning.

## DEV Deploy
- `meet-poc-fe` restarted successfully with PM2 and is online.
