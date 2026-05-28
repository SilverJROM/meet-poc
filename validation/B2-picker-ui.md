# B2 Picker UI Validation

## Files touched
- `frontend/src/app/components/background-picker/background-picker.component.ts`
- `frontend/src/app/components/background-picker/background-picker.component.html`
- `frontend/src/app/components/background-picker/background-picker.component.scss`
- `frontend/src/app/components/lobby-preview/lobby-preview.component.ts`
- `frontend/src/app/components/lobby-preview/lobby-preview.component.html`
- `frontend/src/app/components/lobby-preview/lobby-preview.component.scss`
- `frontend/src/app/pages/room/room.page.ts`
- `frontend/src/app/pages/room/room.page.html`
- `frontend/src/assets/backgrounds/*`
- `validation/B2-picker-lobby.png`
- `validation/B2-picker-in-call.png`

## Asset sourcing
- Method: C - generated SVG fallback.
- Justification: generated CC0 assets avoid unclear third-party photo licensing and keep every file well under 500KB.
- Credits: `frontend/src/assets/backgrounds/CREDITS.md`.

## Picker component API
- Selector: `<app-background-picker />`
- Optional input: `presentation="inline" | "overlay"`; inline is used in the lobby, overlay in-call.
- Output: `(closeRequested)` fires for overlay backdrop click, close button, and Escape.
- Persistence: writes `meet-poc:bg:selected` as `{ mode, asset? }`.

## Integration points
- Lobby: replaces the B1 temporary blur button inside `app-lobby-preview`.
- In-call: room page adds a wand icon button that opens the picker overlay and closes on re-click, Escape, close button, or backdrop click.
- Locked B1 paths left intact: `background-effects.service.ts`, `effectiveLocalStream`, `lastSfuVideoTrack`, and the SFU sync effect.

## Accessibility
- Tiles render as buttons with `role="radio"` inside a `role="radiogroup"`.
- Active tile exposes `aria-checked=true` and a visible 2px selection ring.
- Enter/Space work through native button activation; arrow keys move focus between tiles.

## Self-verification
- `cd backend && npm run build`: PASS.
- `cd frontend && npm run build`: PASS with existing Stencil empty-glob and MediaPipe CommonJS warnings.
- `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line`: PASS, 16/16.
- Screenshots: `validation/B2-picker-lobby.png`, `validation/B2-picker-in-call.png`.
