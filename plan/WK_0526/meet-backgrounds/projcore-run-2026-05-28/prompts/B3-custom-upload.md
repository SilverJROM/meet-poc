# Batch B3 — Custom background upload (R20)

> **Role for THIS dispatch:** You are the IMPLEMENTER. You are NOT projcore. Claude /projcore supervises from session `lkvc` and watches `lkvc-codex` for your STATUS callback. Do NOT invoke `$projcore`, do NOT modify queue/progress/req-matrix/context-handoff/north-star/og-requirements/callbacks. Implement THIS batch only and emit `STATUS: DONE — Batch B3 ready for validation` when finished.

## Read first

1. `plan/WK_0526/meet-backgrounds/projcore-run-2026-05-28/context-handoff.md` — what B1+B2 already shipped.
2. `plan/WK_0526/meet-backgrounds/projcore-run-2026-05-28/og-requirements.md` § R20.
3. `frontend/src/app/components/background-picker/background-picker.component.{ts,html,scss}` — where you will extend.

## No PROPOSED handshake required — this is a tightly-scoped extension to an existing component.

## Scope

### R20.1 — Upload tile

Add a "+ Upload custom" tile (or a single button-styled tile shaped like the others) at the END of the picker grid. Clicking it triggers a hidden `<input type="file" accept="image/*" />` (use `@ViewChild` or template ref + `.click()`).

### R20.2 — Image resize pipeline

When user selects a file:
1. Validate `file.type.startsWith('image/')` and `file.size <= 10 * 1024 * 1024` (10MB cap). If not, set an error signal `uploadError` and bail.
2. Read file via `FileReader.readAsDataURL` → `Promise<string>`.
3. Create an `HTMLImageElement`, `image.src = dataUrl`, wait for `onload`.
4. Compute resize dimensions:
   - Max: 1280×720 (preserve aspect ratio, fit inside box — use `Math.min(1280/srcW, 720/srcH, 1)`)
   - Don't upscale (factor capped at 1)
5. Draw to offscreen canvas at computed dimensions.
6. `canvas.toDataURL('image/jpeg', quality)` starting at `quality = 0.85`.
7. If resulting data URL length × 0.75 > 1_000_000 bytes (approximate base64 → binary size), retry with quality `0.7`, then `0.6`, then `0.5`. If still >1MB at 0.5, set `uploadError = 'Image too large after compression'` and bail.

### R20.3 — Persistence keys

- Index key: `meet-poc:bg:custom:index` — JSON array of string IDs, chronological order (oldest first).
- Per-custom data: `meet-poc:bg:custom:<id>` — the JPEG data URL string.
- ID generation: `crypto.randomUUID()` or `Date.now().toString(36)` if randomUUID unavailable.
- FIFO eviction: when adding a 6th custom, remove the oldest (first id in array) — delete both index entry and the data key.

### R20.4 — Picker rendering

The OPTIONS list stays as 7 hardcoded items. Add a separate signal `customs: Signal<CustomBackground[]>` derived from localStorage on init. Render order in template:
1. None, Blur (top row)
2. 5 generic presets (next rows)
3. Custom uploads (signal-derived; one tile per custom)
4. "+ Upload custom" tile (always last)

Each custom tile:
- Shows the data URL as background image
- Label: "Custom N" where N is 1..5 in order, OR original filename (truncated)
- Small × button in top-right corner to delete (removes from localStorage + index + signal). If currently-selected custom is deleted, fall back to mode='none' and update STORAGE_KEY.

### R20.5 — Selecting a custom

Reuse the existing `select(option)` pattern. Add a new `CustomBackground` type to `BackgroundOption` union:
```ts
type CustomBackground = { id: string; label: string; mode: 'image'; assetUrl: string; isCustom: true };
type BackgroundOption = ... | CustomBackground;
```

When selecting a custom, persist to `STORAGE_KEY` as `{ mode: 'image', asset: id }` AND mark it as custom — `restoreSelection()` must resolve `asset` first against IMAGE_OPTIONS then against customs.

### R20.6 — Restore custom across sessions

On init:
1. Read `meet-poc:bg:custom:index` → resolve each id → build customs signal.
2. Read `STORAGE_KEY` → if `asset` matches an IMAGE_OPTION id, restore as before; if matches a custom id, set selectedId + setBackgroundImage(custom.assetUrl).

### R20.7 — Manual self-check

1. `cd backend && npm run build` — PASS.
2. `cd frontend && npm run build` — PASS.
3. Open dev URL, lobby. Click "+ Upload custom". Pick a photo (you can use any test image; codex has fs access to grab one from disk if needed, or use a small JPEG). Verify tile appears, gets selected, preview shows the photo as background.
4. Reload page. Verify custom tile still present + still selected.
5. Add 5 more uploads (total 6 → FIFO evicts oldest). Verify oldest removed.
6. Click × on a custom. Verify removal from localStorage + UI.
7. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — 16/16 PASS.
8. Screenshot picker with custom tiles: `validation/B3-picker-with-customs.png`.

## Hard constraints

- ONLY touch: `background-picker.component.{ts,html,scss}`, `validation/B3-*`. NO other files.
- DO NOT touch background-effects.service.ts.
- DO NOT touch room.page.ts.
- DO NOT add backend.
- DO NOT touch B4 mobile gating (next batch).
- Resize MUST happen client-side (no server upload).
- FIFO eviction at 5 customs max (6th add evicts oldest).
- File-size cap: 10MB raw input, 1MB final processed.

## Acceptance gate

1. Code review by projcore: upload + resize + persist + FIFO eviction + delete + restore all work; STORAGE_KEY persists across page reload; B1/B2 paths untouched.
2. Build + e2e fixloop-banner green.
3. Screenshot `validation/B3-picker-with-customs.png` (picker with ≥1 custom tile).
4. Write `validation/B3-custom-upload.md`: files touched, resize ladder used, FIFO logic, restore logic, error-handling for oversize.
5. Commit message: `feat(bg): custom background upload (R20)`.

## Stop conditions

- If localStorage quota is hit during testing, document it and STOP — the spec assumes ~5MB quota is enough but quota may be smaller in some browsers.
- If FileReader / canvas / toDataURL fail in any test environment, STOP and report.

## Self-check

- [ ] Upload tile in picker
- [ ] File-input click works
- [ ] Resize pipeline 1280×720 with quality ladder 0.85→0.7→0.6→0.5
- [ ] localStorage index + per-custom data keys
- [ ] FIFO at max 5
- [ ] Each custom tile has × delete
- [ ] Selected custom restores on reload
- [ ] Picker accommodates customs visually (grid wraps cleanly)
- [ ] B1/B2 surface unchanged
- [ ] Build + e2e green
- [ ] Screenshot saved
- [ ] Validation doc written

Final line MUST be EXACTLY: `STATUS: DONE — Batch B3 ready for validation`
