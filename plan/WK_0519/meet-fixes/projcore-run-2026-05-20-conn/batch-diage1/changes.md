# DIAGE1 Changes

## Scope
- Branch: `fix/meet-conn-diag`
- Requirements: DR-14 and DR-15

## Files Changed
- `backend/migrations/0005_room_slugs.sql`
- `backend/src/modules/rooms/index.ts`
- `backend/src/modules/rooms/store.ts`
- `backend/src/modules/signaling/index.ts`
- `frontend/src/app/app.routes.ts`
- `frontend/src/app/pages/room/room.page.ts`
- `frontend/src/app/pages/rooms/rooms.page.*`
- `frontend/src/app/services/rooms.service.ts`
- `backend/tests/rooms.test.ts`
- `backend/tests/signaling-auto-admit.test.ts`
- `e2e/fixtures/rooms.ts`
- `e2e/tests/v2-b4-tabs/create-room.spec.ts`
- `e2e/tests/v3-diage1-rooms-slugs/diage1-rooms-slugs.spec.ts`

## What Changed
- Added `rooms.slug` with a unique partial index and deterministic legacy backfill using title-derived base plus id suffix.
- Room creation now stores title-derived slugs with a random six-character suffix and retries on id/slug collision.
- Added owner-only custom slug endpoint with lowercase normalization, reserved/id-shaped rejection, length validation, and duplicate detection.
- Added slug-or-id room resolution for public room existence checks and signaling joins.
- Signaling resolves slug-or-id once, then uses canonical `room.id` for live room maps, owner checks, sessions, recording ids, and reconnect tickets.
- Rooms list rows now navigate on click/keyboard, while row actions stop propagation.
- Frontend room links and share URLs use slug; legacy `/room/:id` still resolves.

## Self-Verification
- `npm run build -w backend`: PASS
- `npm run build -w frontend`: PASS
- `npm test -w backend`: PASS, 106 passed / 1 skipped
- DIAGE1 focused E2E on `/tmp/meet-diage1.sqlite`: PASS, 4/4
- Clean-db Run-1 + diag sweep on `/tmp/meet-diage1-full.sqlite`: PASS, 87/87
- Live DB migration: PASS, 83 slugged rooms, `TEST_ROOM01` slug `test-room01-testro`, 0 duplicate slugs

## Reproduction Notes
- Before: room rows required the Join link and room URLs used raw ids only.
- After: rows are clickable, slug URLs open rooms, and legacy id URLs remain valid.

## Caveats
- The slug column stays nullable to keep direct legacy/test fixture inserts from breaking, but all API-created/customized rooms receive slugs.
