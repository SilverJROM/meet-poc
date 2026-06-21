# Batch B12 Changes

## Branch

`feat/crossplatform-devices-20260604` @ `00a5f03`

## User Report

"pagehide ALWAYS calls cleanupCall() -> on mobile Safari/BFCache, switching apps and returning destroys media+SFU+WS while the UI may resume in a broken in-call state."

## Root Cause

`RoomPage.handlePageLifecycleLeave()` handled every `pagehide` and `beforeunload` event as a real exit, so BFCache freezes and mobile app backgrounding ran the same destructive `cleanupCall()` path as tab close/refresh.

## Code Changes

- `frontend/src/app/pages/room/room-lifecycle.ts` — Added pure `decideRoomLifecycleLeave()` helper to classify BFCache/mobile background as `pause` and real unload as `cleanup`.
- `frontend/src/app/pages/room/room-lifecycle.spec.ts` — Covered all four required cases: persisted pagehide, mobile hidden pagehide, beforeunload, and desktop non-persisted pagehide.
- `frontend/src/app/pages/room/room.page.ts` — Routed `pagehide`/`beforeunload` through the helper, added `pageshow` BFCache resume, preserved existing explicit leave and `ngOnDestroy()` cleanup, and reused B11 republish only when SFU publish health is not healthy.
- `frontend/src/app/services/sfu-client.service.ts` — Added `isLocalPublishHealthy()` so BFCache resume skips republish for healthy published calls and only resets/republishes when publish state or PC health is dead/missing.

## Verification

- PASS: `npm run build -w frontend`
- PASS: `npx tsx frontend/src/app/pages/room/room-lifecycle.spec.ts`
- PASS: `npx tsx frontend/src/app/services/sfu-client.spec.ts`

## Caveats

- VALIDATION LIMITATION: Real mobile background behavior is still a JROM seat check per the batch brief.
