# B1 Changes

## Files Touched
- `backend/src/modules/signaling/index.ts`
- `backend/src/modules/rooms/store.ts`
- `frontend/src/app/services/ws.service.ts`
- `plan/WK_0526/meet-features/projcore-run-2026-05-28/validation/B1-changes.md`

## What Changed
- Added backend system helpers to open and close a room without going through the authenticated REST owner-email path.
- Enforced guest WS joins by requiring unauthenticated joiners to provide a non-empty display name before entering the existing wait/knock/admit flow.
- Added backend-driven host auto-open when an owner reaches the admitted state in a closed room.
- Added a distinct `close-room` WS handler that sets the room closed, broadcasts `room-closed` to admitted peers, pending knockers, and closed-room waiters, closes their sockets, clears wait timers, and removes live room state.
- Added `room-opened`, `room-closed`, and `close-room` to the frontend WS type unions only.

## Auto-Open Trigger Placement
- `backend/src/modules/signaling/index.ts:836`: immediately after the owner receives the `admitted` message and while the owner is already in `live.admitted`.

## Why
- WS upgrade is already unauthenticated, so guest support belongs inside the `join` message handler.
- Backend signaling is the authority for room lifecycle state, so owner admission auto-opens the room without a frontend command.
- `close-room` is distinct from `meeting-ended-by-host` because it must also persist `is_open = 0` and include closed-room waiters.

## Self-Verification
- Command: `cd /home/agjrom/websites/meet-poc/backend && npm run build`
- Result: PASS. TypeScript build completed with 0 errors.
- Command: `cd /home/agjrom/websites/meet-poc/frontend && ng build`
- Result: PASS. Angular build completed with 0 errors. It emitted the existing Stencil `empty-glob` warning from `node_modules/@stencil/core/internal/client/index.js`; no B1-specific warning was emitted.

## Manual Code Review
- Confirmed only backend signaling/store files and the frontend WS type union were changed.
- Confirmed no `room.page.ts`, `room.page.html`, app route, or in-call UI file was touched.
