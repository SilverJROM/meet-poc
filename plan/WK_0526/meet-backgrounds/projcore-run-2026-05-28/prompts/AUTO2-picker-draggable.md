# Autonomous Ask #2 — Picker draggable + closable + reopen via settings

> **Role for THIS dispatch:** You are the IMPLEMENTER. JROM is asleep. Claude /projcore is operating autonomously.

## Ask (verbatim from JROM)

> "also make the background draggable to reposition it or close it and just put it on setting if closed"

## Read first

- `frontend/src/app/components/background-picker/background-picker.component.{ts,html,scss}`
- `frontend/src/app/pages/room/room.page.{ts,html}` — wand button at line ~102; `backgroundPickerOpen` signal
- `frontend/src/app/components/controls-bar/controls-bar.component.{ts,html}` — the settings/cog control path
- `frontend/src/app/components/lobby-preview/lobby-preview.component.{html,scss}` — lobby uses inline presentation (not affected by this ask)

## Scope

### Required behaviors

1. **Draggable in-call overlay (desktop only).** When the picker is open via the wand button in-call:
   - Header bar acts as drag handle
   - User can drag the panel anywhere within viewport
   - Position is clamped to viewport bounds (cannot go off-screen)
   - Position is remembered for the session (in-memory; OK to lose on reload)
2. **Close button (×).** Clicking × hides the picker but does NOT change the active background mode.
3. **Reopen via settings/cog.** Once closed, the picker reopens via the controls-bar settings/cog button, in addition to the existing wand button. Place a "Background effects" menu item or icon in the settings popover.
4. **Mobile preserves current behavior.** Don't add drag on mobile; let the existing overlay/bottom-sheet pattern stand. `viewport.isMobile()` gates drag handling.

### Hard constraints

- Touch only: `background-picker.component.{ts,html,scss}`, `controls-bar.component.{ts,html,scss}`, `room.page.{ts,html}` (minimal). Do NOT touch `room.page.scss` unless required by the wand button placement.
- Do NOT change picker functionality (None/Blur/presets/customs/upload still work identically when open).
- Do NOT change lobby inline picker behavior.
- Do NOT change `background-effects.service.ts`.
- Do NOT touch `room.page.ts` `peers()` / SFU / streams.

### UX details

- Drag handle: subtle cursor (`cursor: grab`, `cursor: grabbing` while dragging)
- Close button: top-right of the picker header, replaces or sits next to existing close button if any
- Settings popover entry: simple list item with the wand icon + "Background effects" label, triggers the same `toggleBackgroundPicker(...)` flow

## Acceptance gate

1. Playwright spec covers: open via wand → drag → close via × → reopen via settings cog
2. Existing background-effects + background-host-self-view specs PASS
3. fixloop-banner 16/16 PASS
4. ng build clean
5. Commit message: `feat(ui): background picker draggable + close-to-settings (Ask #2)`
6. Validation note: `validation/AUTO2-picker-draggable.md`
7. Deploy: pm2 restart meet-poc-fe

Final line MUST be EXACTLY: `STATUS: DONE — Ask #2 ready for validation`

## Stop conditions

- If drag handling on desktop conflicts with picker grid clicks (tile selection), STOP and propose alternative (e.g., drag handle restricted to header).
- If the settings popover doesn't have a sensible slot for the new entry, document and minimize changes.
