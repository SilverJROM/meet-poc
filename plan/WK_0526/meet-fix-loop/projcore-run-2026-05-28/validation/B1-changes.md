# B1 Changes

## Files Touched
- `frontend/src/app/pages/room/room.page.html`
- `frontend/src/app/pages/room/room.page.scss`
- `plan/WK_0526/meet-fix-loop/projcore-run-2026-05-28/validation/B1-changes.md`

## What Changed
- Added a host-only knock banner in the in-call `call-panel` notice stack.
- The banner renders one row per pending knocker, showing `<name> wants to join` with inline `Admit` and `Reject` buttons wired to existing `admit(knocker.id)` and `reject(knocker.id)`.
- Added the `.knock-banner` SCSS and slide-in animation from the implementation plan.

## Placement Decision
- The banner is inside `<section class="call-panel">`, after the existing action notice and before the remote-audio unblock notice.
- It is outside `.call-content`, so screen-share layout changes from `shareLayoutActive()` do not hide or re-grid the banner with the tiles, share stage, sidebar, or chat panels.

## Self-Verification
- Command: `cd /home/agjrom/websites/meet-poc/frontend && ng build`
- Result: PASS. Angular build completed with 0 errors. The build emitted the existing Stencil `empty-glob` warning from `node_modules/@stencil/core/internal/client/index.js`; no B1 template or SCSS warning was emitted.

## Caveats
- No TypeScript methods were added or changed. Existing public `admit(clientId)` and `reject(clientId)` are used directly.
