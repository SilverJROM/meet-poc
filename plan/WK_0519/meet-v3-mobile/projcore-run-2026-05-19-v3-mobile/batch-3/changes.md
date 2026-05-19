# M-B3 Changes

## User Report

Invoke `$lead` for M-B3 mobile call layout. Implement mobile bottom-sheet participants, docked mobile controls, mobile grid variants, screen-share hidden on mobile, iOS keyboard handling, tap-to-switch sidebar sections, desktop-unaffected regression, Run 1 desktop regression, and commit before `STATUS: DONE`.

## Code Changes

- `frontend/src/app/components/participant-sidebar/*`
  - Extends the existing participant sidebar instead of introducing a second component.
  - Adds `ViewportService`-driven mobile mode.
  - Adds a mobile backdrop, sheet handle, 75dvh bottom-sheet layout, and swipe-down dismissal.
  - Adds mobile tap tabs for host section switching between `In the call` and `Waiting`.
  - Keeps guests on the participant list without waiting-room tabs.
  - Closes the mobile sheet when a text/select control inside the sheet receives focus, covering the iOS virtual-keyboard case.
- `frontend/src/app/components/controls-bar/*`
  - Uses `ViewportService` to remove the screen-share button from the mobile DOM.
  - Docks the mobile controls bar to the bottom with safe-area padding and horizontal overflow protection.
  - Preserves the desktop top-mounted controls bar.
- `frontend/src/app/pages/room/room.page.*`
  - Wires the participant sidebar close output back to `sidebarOpen`.
  - Adds mobile grid overrides: 1 peer full call area, 2 peers vertical stack, 3-4 peers 2x2.
  - Adds bottom padding for fixed controls and mobile-safe meeting metadata placement.
- `frontend/src/app/components/tile/tile.component.scss`
  - Adds mobile sizing guards so tile overlays remain readable in compact grids.
- `e2e/tests/v3-mb3-call-layout/*`
  - Adds focused live Playwright coverage for bottom-sheet behavior, mobile/desktop controls, mobile grid variants, screen-share mobile absence and desktop presence, and desktop sidebar invariants.

## Decisions Logged

- Bottom-sheet strategy: extend `<app-participant-sidebar>` with mobile CSS/logic.
- iOS keyboard strategy: close the mobile sheet when an input/select/textarea inside it receives focus.
- Tap-to-switch strategy: keep a local `activeSection` signal inside the sidebar and expose host-only mobile tabs.

## Screenshots

- `screenshots/mobile-bottom-sheet-open.png`
- `screenshots/mobile-controls-docked.png`
- `screenshots/mobile-grid-1peer.png`
- `screenshots/mobile-grid-2peer.png`
- `screenshots/screen-share-hidden-mobile.png`
- `screenshots/screen-share-visible-desktop.png`
- `screenshots/desktop-sidebar-still-right.png`
- `screenshots/desktop-controls-top.png`
