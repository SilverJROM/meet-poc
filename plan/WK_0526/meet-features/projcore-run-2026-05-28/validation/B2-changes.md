# B2 Changes

## Files Touched
- `backend/src/modules/rooms/index.ts`
- `frontend/src/app/app.routes.ts`
- `frontend/src/app/pages/join/join.page.ts`
- `frontend/src/app/pages/join/join.page.html`
- `frontend/src/app/pages/join/join.page.scss`
- `frontend/src/app/pages/room/room.page.ts`
- `frontend/src/app/pages/room/room.page.html`
- `frontend/src/app/pages/room/room.page.scss`
- `plan/WK_0526/meet-features/projcore-run-2026-05-28/validation/B2-changes.md`

## What Changed
- Added public `GET /api/rooms/by-slug/:slug`, returning only `id`, `slug`, `title`, and `isOpen`.
- Added a lazy `/join` page where guests enter room code and display name, validate the room via the public endpoint, store `guestDisplayName` in `sessionStorage`, and navigate to `/join/:slug`.
- Added an unauthenticated `/join/:slug` name overlay in `RoomPage`, prefilled from `sessionStorage`.
- Added light Google Meet-style styling for the standalone join card and the room guest-name overlay.

## Preflight Gate
- `RoomPage.bootstrap()` still calls `AuthService.checkSession()` first, then resolves room metadata.
- If the route is `/join/:slug` and `auth.user()` is `null`, bootstrap now returns before `prepareLobbyDeviceCheck()` is called.
- The overlay calls `continueAsGuest()` only after a non-empty name is submitted; that method stores the name, sets `displayName`, dismisses the overlay, and then calls `prepareLobbyDeviceCheck()`. This prevents mic/camera preflight from starting before an unauthenticated guest identifies themselves.

## Self-Verification
- Command: `cd /home/agjrom/websites/meet-poc/backend && npm run build`
- Result: PASS. TypeScript build completed with 0 errors.
- Command: `cd /home/agjrom/websites/meet-poc/frontend && ng build`
- Result: PASS. Angular build completed with 0 errors and produced a `join-page` lazy chunk. It emitted the existing Stencil `empty-glob` warning from `node_modules/@stencil/core/internal/client/index.js`; no B2-specific warning was emitted.

## Manual Code Review
- Confirmed guest overlay is route-gated to `/join/:slug` and unauthenticated users only.
- Confirmed standalone `/join` validates through the new public lookup endpoint.
- Confirmed no in-call components, controls, tiles, chat, sidebar, signaling, SFU, or leave-dialog files were touched.
