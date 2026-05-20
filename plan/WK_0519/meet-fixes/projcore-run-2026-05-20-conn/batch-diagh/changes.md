# Batch DIAGH Changes

## Scope
- branch: fix/meet-conn-diag
- batch: DIAGH, DR-23

## Files Changed
- `backend/src/modules/rooms/index.ts`
- `backend/src/modules/rooms/store.ts`
- `backend/tests/rooms.test.ts`
- `frontend/src/app/services/rooms.service.ts`
- `frontend/src/app/pages/rooms/rooms.page.ts`
- `frontend/src/app/pages/rooms/rooms.page.html`
- `frontend/src/app/pages/rooms/rooms.page.scss`
- `e2e/tests/v3-diagh-rooms-search/diagh-rooms-search.spec.ts`

## What Changed
- Added `q` parsing to `GET /api/rooms`.
- Added owner-scoped, case-insensitive title filtering to both legacy and paginated room-list queries.
- Kept filtered pagination totals server-side so search spans all pages.
- Added a URL-bound rooms search input on `/app/rooms`; search changes reset to page 1, and clearing search restores all rooms.
- Added backend and Playwright coverage proving a room outside page 1 can be found by search.

## Self-Verification
- `npm run build`: PASS
- `npm test -w backend -- rooms.test.ts`: PASS, 13/13
- `npm test -w backend`: PASS, 114 passed / 1 skipped
- `MEET_DB_PATH=/tmp/meet-diagh-target.sqlite ... npm test -w e2e -- tests/v3-diagh-rooms-search --config=playwright.config.ts --workers=1`: PASS, 1/1
- Clean Run-1 + diag gate on `/tmp/meet-diagh-gate.sqlite`: PASS, 94/94

## Reproduction Notes
- Before: rooms pagination was server-backed, but `/api/rooms` could only list all owned rooms or one unfiltered page.
- After: `/api/rooms?q=needle&page=1&pageSize=20` returns only owner-owned title matches and a filtered `total`.

## Caveats
- Search is intentionally by room title only, not slug or URL.

