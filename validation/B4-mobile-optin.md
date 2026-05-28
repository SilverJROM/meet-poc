# B4 Mobile Opt-In Validation

## Files Touched
- `frontend/src/app/components/background-picker/background-picker.component.ts`
- `frontend/src/app/components/background-picker/background-picker.component.html`
- `frontend/src/app/components/background-picker/background-picker.component.scss`
- `validation/B4-mobile-optin.md`
- `validation/B4-picker-desktop-no-warning.png`
- `validation/B4-picker-mobile-warning.png`

## Viewport Integration
- `BackgroundPickerComponent` injects `ViewportService`.
- The component exposes `isMobile` from `viewport.isMobile` for template control flow and restore policy checks.

## Warning Placement
- Mobile warning renders above the picker grid inside the picker panel.
- Warning text is exact: `Background effects may drain battery and reduce video quality on this device.`
- Desktop does not render the warning.

## Default-Off Semantics
- Mobile first visit skips `meet-poc:bg:selected` restore unless `meet-poc:bg:mobile-opt-in` is `true`.
- When skipped, the picker selects `None` and applies `mode: none` without clearing the stored desktop selection.
- Desktop restore behavior remains unchanged.

## Opt-In Flag Handling
- Selecting any non-None option on mobile writes `meet-poc:bg:mobile-opt-in=true` before applying the effect.
- Selecting `None` on mobile does not clear the opt-in flag.
- After opt-in, mobile restore honors the same persisted selection as desktop.

## Self-Verification
- `cd backend && npm run build`: PASS.
- `cd frontend && ng build`: PASS with existing Stencil empty-glob and MediaPipe CommonJS warnings.
- Browser smoke: PASS.
  - Desktop lobby showed no warning.
  - Desktop Blur selection persisted across reload.
  - Mobile lobby showed the warning.
  - Mobile first visit forced None despite stored desktop Blur and no opt-in flag.
  - Mobile Blur selection wrote `meet-poc:bg:mobile-opt-in=true` and persisted across reload.
- `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line`: PASS, 16/16.
- Screenshots: `validation/B4-picker-desktop-no-warning.png`, `validation/B4-picker-mobile-warning.png`.
