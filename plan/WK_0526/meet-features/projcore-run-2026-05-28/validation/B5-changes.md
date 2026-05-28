# B5 Changes

## Files Touched
- `frontend/src/app/pages/room/room.page.html`
- `frontend/src/app/pages/room/room.page.scss`
- `frontend/src/app/components/lobby-preview/lobby-preview.component.scss`
- `plan/WK_0526/meet-features/projcore-run-2026-05-28/validation/B5-changes.md`

## What Changed
- Redesigned the main pre-join lobby state into a Google Meet-style centered white surface on a soft `#f8f9fa` background.
- Added a scoped `prejoin-panel` layout with a desktop two-column grid: large lobby preview on the left and room title, name input, quick toggles, configure affordance, and join action on the right.
- Switched the existing lobby preview from compact to full mode so its built-in mic level and device selectors remain visible in the redesigned prejoin flow.
- Restyled the name input, mic/camera toggles, warning/error blocks, primary join button, device selector pills, preview tile, and mobile stacked layout.

## Before/After Layout Notes
- Before: narrow single-column lobby card with the preview, form controls, and configure button stacked vertically.
- After: max-width 960px prejoin card with a large rounded preview, side controls, blue filled active toggle pills, material-ish input focus ring, prominent full-width join button, and stacked mobile layout below 720px.
- Permission errors now use `#fce8e6`; warnings use `#fef7e0`, and both remain above the prejoin grid.

## Preserved Handler Review
- Join submit remains `(ngSubmit)="join()"` on the prejoin form.
- Name input keeps `[ngModel]="displayName()"` and `(ngModelChange)="updateDisplayName($event)"`.
- Name input keeps `[disabled]="state() === 'connecting'"`.
- Mic toggle keeps `[ngModel]="microphoneRequested()"`, `(ngModelChange)="setLobbyMicEnabled($event)"`, and `[disabled]="state() === 'connecting'"`.
- Camera toggle keeps `[ngModel]="cameraRequested()"`, `(ngModelChange)="setCameraRequested($event)"`, and `[disabled]="state() === 'connecting'"`.
- Join button keeps `[disabled]="state() === 'connecting'"`.
- Lobby preview keeps `changeAudioDevice`, `changeVideoDevice`, `enableMicPreview`, and `flipCamera` event wiring.
- Device dialog configure button and inline device dialog event wiring are preserved.

## Self-Verification
- Command: `cd /home/agjrom/websites/meet-poc/backend && npm run build`
- Result: PASS. TypeScript build completed with 0 errors.
- Command: `cd /home/agjrom/websites/meet-poc/frontend && ng build`
- Result: PASS. Angular build completed with 0 errors. It emitted the existing Stencil `empty-glob` warning from `node_modules/@stencil/core/internal/client/index.js`; no B5-specific warning was emitted.
- Command: `git diff --check -- frontend/src/app/pages/room/room.page.html frontend/src/app/pages/room/room.page.scss frontend/src/app/components/lobby-preview/lobby-preview.component.scss`
- Result: PASS. No whitespace errors.

## Manual Code Review
- Confirmed the waiting-room, knocking, rejected, error, checking, in-call, and knock-banner template blocks were not reorganized.
- Confirmed no `RoomPage` TypeScript, services, backend, routes, or shared in-call components were changed.
- Confirmed `app-lobby-preview` TypeScript and HTML were not touched; only its SCSS was adjusted for the new lobby presentation.
