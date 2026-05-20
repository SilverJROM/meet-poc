# Batch MUI Changes

## User Report
> "1. can you copy how the google meet ui shows, the tabs on bottom and how the video icons show and share screen not 1 to 1 atleast 80-90% the look and feel. 2. my US counterpart is still not working, he can hear me but i cant hear him even though when on device check his mic is working or my video is not coming thru, but when i test with someone from qatar it was working fine. 3rd add a chat functionality on the window."

## Scope Applied
DR-26 only: Meet-like in-call restyle. No chat behavior, reactions, raise-hand, captions, signaling, media, or deployment changes.

## Root Cause / Mechanism
The in-call UI still used the earlier soft-light, top-mounted control bar and rectangular tile styling. Existing handlers and state were correct, but the layout did not match the approved Meet-like arrangement: bottom center controls, bottom-corner metadata/tools, darker call surface, rounded tiles, camera-off avatars, and presenter-plus-strip share visual treatment.

## Code Changes
- `frontend/src/app/components/controls-bar/controls-bar.component.html`
  - Reworked control markup into bottom-left meeting metadata, center primary controls, and bottom-right meeting tools.
  - Preserved all existing outputs: `mute`, `camera`, `screen`, `record`, `sidebar`, `diagnostics`, `audioOnlyToggle`, `devices`, and `leave`.
  - Added inert disabled chat placeholder for DR-27.
- `frontend/src/app/components/controls-bar/controls-bar.component.ts`
  - Added elapsed-time input and registered only standard Ionicons used by the new layout.
  - Removed mobile hiding logic for share so the approved mobile reachability rule is honored.
- `frontend/src/app/components/controls-bar/controls-bar.component.scss`
  - Replaced soft-light top bar styling with fixed dark bottom call chrome.
  - Added split mic/camera controls with device chevrons, red/off states, scrollable mobile rail, and disabled chat styling.
- `frontend/src/app/components/tile/tile.component.ts`
  - Changed avatar backgrounds from solid colors to deterministic gradients.
- `frontend/src/app/components/tile/tile.component.scss`
  - Restyled tiles with larger rounded corners, bottom-left labels, muted icon treatment, camera-off avatar treatment, and active-speaker outline.
- `frontend/src/app/pages/room/room.page.html`
  - Passed elapsed time into the controls bar and removed the separate floating clock block.
- `frontend/src/app/pages/room/room.page.scss`
  - Scoped dark styling to the in-call surface, restyled share stage/strip, and preserved soft-light lobby and non-call surfaces.
- `e2e/tests/v3-mui-meet-ui/meet-ui.spec.ts`
  - Added DR-26-focused Playwright coverage for controls, tile states, share layout, and mobile reachability.
- Existing E2E contract updates:
  - `e2e/tests/b4-call-ui/controls.spec.ts`
  - `e2e/tests/v3-mb3-call-layout/controls-and-grid.spec.ts`
  - `e2e/tests/phase2-axes/two-axis-matrix.spec.ts`
  - Updated expectations honestly for approved bottom desktop controls and mobile share reachability.

## IP / Asset Note
Only the app's existing standard Ionicons/open icon set is used. No Google artwork, logos, brand assets, or proprietary icon shapes were copied.

## Freeze Caveat
JROM live-call freeze received during implementation. No pm2 restart, no deploy, and no Playwright/e2e run against live services were performed. Screenshot capture is deferred because it requires browser execution under the frozen call window.
