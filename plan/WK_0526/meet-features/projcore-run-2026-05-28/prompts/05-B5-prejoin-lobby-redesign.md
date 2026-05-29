# B5 — UI: pre-join/lobby redesign (R9)

Google Meet-inspired pre-join screen. **Visual + layout only — no functional changes.** All preflight, name validation, device selection, mic toggle, camera toggle, and join-button behavior must keep working identically.

## Scope

Files allowed:
- `frontend/src/app/pages/room/room.page.html` (the `<section class="lobby-panel">` block around line 296 — the pre-join state, NOT the in-call section)
- `frontend/src/app/pages/room/room.page.scss` (lobby-related rules only — don't touch in-call or knock-banner styles from earlier batches)
- `frontend/src/app/components/lobby-preview/lobby-preview.component.scss` (ONLY if the preview component's outer styling needs polish to integrate with the new layout; do NOT touch its .ts/.html structure)

## Visual direction (Google Meet pre-join)

- **Background:** soft neutral `#f8f9fa` on the page, white surface on the lobby card.
- **Layout (desktop):** centered, max-width ~960px. Two-column grid:
  - LEFT column (~60% width): the `app-lobby-preview` (the camera-preview area, including the mic level indicator) — large, rounded 12px, drop shadow.
  - RIGHT column (~40% width): vertical stack with: room title (h1, ~24px, regular weight), name input, mic/camera quick toggles, device-selector pills, primary "Join now" button at the bottom (full-width of column, prominent blue `#1a73e8`, big — height ~48px).
- **Layout (mobile, <720px width):** stacked. Preview on top (full width, ~16:9), form below. Single-column.
- **Name input:** material-ish style — large input, ~16px font, light gray border, focus ring blue. Keep the same hints/errors/ngModel binding.
- **Quick toggles:** Convert the current checkbox+ion-icon rows into pill-style toggle buttons. When mic is on: blue filled pill with mic icon + "Mic on". When off: gray outline pill. Same for camera. Keep `[ngModel]`/`(ngModelChange)` bindings exactly — only the markup wrapper changes.
- **"Join now" button:** primary blue, white text, 48px tall, full-width-in-column. Disabled state when name is empty or `state() === 'connecting'` (already in code; preserve).
- **Permission error/warning blocks:** keep functionally; restyle to fit (light red background `#fce8e6` for errors, gold background `#fef7e0` for warnings). Place them above the grid (above the preview), full-width.
- **Knocking/waiting states** (the other 4–5 lobby-panel variants around lines 29–82): NOT in scope for B5. Touch ONLY the main lobby-panel at lines 296–~400 and its existing children.

## Hard constraints

- DO NOT change `app-lobby-preview` component .ts or .html — it's used elsewhere. Only its outer .scss can be touched if needed.
- DO NOT change any `(ngSubmit)`, `(click)`, `[ngModel]`, `(ngModelChange)`, or `[disabled]` bindings. Restyle the wrapping markup only.
- DO NOT touch the knocking-panel, waiting-room-panel, or checking/not-found/rejected variants. Those are separate states.
- DO NOT touch the in-call `<section class="call-panel">` block — that's strict OUT.
- DO NOT touch the new knock-banner styles (from fix-loop B1) — they are unrelated.

## Acceptance gate

1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. Manual code review:
   - Confirm `(ngSubmit)="join()"` is preserved on the form.
   - Confirm name input still uses `[ngModel]="displayName()"` and `(ngModelChange)="updateDisplayName($event)"`.
   - Confirm mic/cam toggles still wire to `setLobbyMicEnabled` and `setCameraRequested` (or their existing equivalents).
   - Confirm `[disabled]="state() === 'connecting'"` is still on the form and inputs.
4. Write `validation/B5-changes.md`: files touched, layout-before/after notes, preserved-handlers list.
5. Commit: `feat(lobby): Google Meet pre-join layout (centered preview + side controls)`. One commit.

## Stop conditions

- 3× build failure → STOP, write `validation/B5-blocker.md`, do NOT push.
- If reorganizing the lobby grid breaks the existing mobile responsiveness in unexpected ways, STOP and report — DO NOT change mobile handling logic.

Final line MUST be: `STATUS: DONE — B5 ready for validation`.
