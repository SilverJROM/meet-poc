# FIX2 Test Report

## Passed
- `npx tsx frontend/src/app/services/sfu-client.spec.ts`
- `npx tsx frontend/src/app/services/sfu-client.spec.ts frontend/src/app/services/remote-audio.service.spec.ts frontend/src/app/services/remote-audio-playability.spec.ts frontend/src/app/services/remote-audio-health.spec.ts frontend/src/app/services/remote-audio-watchdog.spec.ts` equivalent executed sequentially via shell loop.
- `npx tsc --noEmit -p frontend/tsconfig.app.json`
- `npx tsc --noEmit -p frontend/tsconfig.spec.json`
- `npx ng build` from `frontend/`
- `pm2 restart meet-poc-fe`

## Notes
- No standalone `sfu-mid-reconcile.spec.ts` or `sfu-roster-utils.spec.ts` files exist in this repo. Their assertions are embedded in `sfu-client.spec.ts`, which passed.
- Literal root `npx tsc --noEmit` is not a valid command in this repo because there is no root `tsconfig.json`; it prints TypeScript help. Frontend app and spec projects were both verified with `--noEmit`.
- Angular build emitted existing warnings for Stencil empty glob and `@mediapipe/selfie_segmentation` CommonJS.
