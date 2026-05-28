# Batch A UI Polish Validation

## Scope

- Removed both in-call diagnostics controls from `app-controls-bar`.
- Removed the in-call diagnostics panel from `room.page.html`.
- Kept diagnostics backend logging internals: `diagnosticsLoggingEnabled`, `queueDiagnosticsLog()`, `flushDiagnosticsLog()`, `meetingSessions.sendDiagnosticsBeacon()`, and `window.__meetDebug`.
- Replaced the full-width host knock banner with a fixed top-right knock toast stack.
- Added `admitAll()` and the `Admit all (N)` toast action for two or more waiting guests.

## Visual Review

- Desktop visual check passed at 1280x800.
- Toast bounding box: `x=984`, `y=16`, `width=280`, `height=73.734375`.
- Confirmed the toast sits top-right and the old `.knock-banner` element is not rendered.
- Screenshot captured locally at `plan/WK_0526/meet-incall-ux/projcore-run-2026-05-28/validation/A-ui-polish-knock-toast.png`.

## Record Button Host-Only Check

- `frontend/src/app/components/controls-bar/controls-bar.component.html` still wraps the record button in `@if (isHost())`.
- `RoomPage.toggleRecording()` still returns immediately when `!this.isHost()`.
- No non-host control path exposes `record.emit()`.

## E2E Coverage

- Updated fixloop banner selectors to `.knock-toast-stack` and `.knock-toast`.
- Added direct Admit all coverage in `e2e/tests/fixloop-banner/banner-toast.spec.ts`.

## Validation Commands

- `cd backend && npm run build` - PASS
- `cd frontend && ng build` - PASS, with existing Stencil empty-glob warning
- `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` - PASS, 8/8
