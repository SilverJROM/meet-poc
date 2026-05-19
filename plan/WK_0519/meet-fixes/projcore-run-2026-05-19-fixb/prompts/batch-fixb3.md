# Batch FIX-B3 — Recordings batch-delete (mirror rooms-bulk-delete)

**⚠️ Hard reminder #1:** **COMMIT BEFORE STATUS: DONE.** Clean tree.
**⚠️ Hard reminder #2:** This batch mirrors a pattern that already shipped today (`8544d9c feat(rooms): batch-select + bulk-delete on the rooms list`). Stay parallel — checkbox per row + Select all on page + Delete selected (N) action bar — same UX language, same SCSS tokens, same confirm-dialog UX.

**Persona switch:** Invoke `$lead`. /projcore supervises.

**Batch ID:** FIX-B3
**Branch:** `fix/meet-fixb3-recordings-bulk-delete` off current HEAD (`c857187`).

**Source:** JROM verbatim — *"add to the capability as well a working record function and the file gets saved on the app. and a folder or tab on the ui shows these and can ba batch deleted as well. please add this to the task list"*. Recording works (FIX-B1.2 verified), files persist (backend `recordingRouter.upload` writes to `recordings/`), `/app/recordings` page exists. The only gap is **batch delete on the recordings tab**.

## What this batch ships

### (1) Backend `POST /api/recordings/bulk-delete`

In `backend/src/modules/recording/index.ts`:

- New route `POST /bulk-delete` accepting body `{ filenames: string[] }` (cap at 200 entries per call).
- For each filename:
  1. **Sanitize** — reject anything matching `/[\\/]/` or `..` (path traversal protection); reject empty strings.
  2. Parse the filename to extract the roomId (your existing parser already does this — reuse it).
  3. Look up room via `getRoom(roomId)`. If null → skip.
  4. Check `room.ownerEmail === authReq.user.email`. If not → skip.
  5. Build full path via `path.join(getRecordingsDir(), filename)`; verify the resolved path is still inside `getRecordingsDir()` (resolve + startsWith check) — defense in depth.
  6. `fs.unlinkSync` (or `fs.promises.unlink`). On ENOENT → count as skipped, not error.
- Response: `{ ok: true, deleted: number, requested: number }`.
- On bad body (`filenames` missing or not array): `400 { error: 'filenames array required' }`.

### (2) Backend tests

Add to `backend/tests/recording.test.ts` a new spec block "bulk-delete":
- 4 recordings: 2 owned by jrom, 1 owned by other-user, 1 with bogus roomId in name. POST `/bulk-delete` with all 4 + 1 traversal attempt (`../etc/passwd`) → assert response `{ ok: true, deleted: 2, requested: 5 }`. Assert only jrom's 2 are gone from disk; other-user's recording survives.
- POST without `filenames` body → 400.
- POST with empty array → 200 `{ ok: true, deleted: 0, requested: 0 }`.

### (3) Frontend `recordings.service.ts`

Add `bulkDelete(filenames: string[]): Promise<{deleted, requested}>` method calling `POST /api/recordings/bulk-delete`. Mirror the `RoomsService.bulkDelete` shape.

### (4) Frontend `recordings.page.ts` + `.html` + `.scss`

Mirror the rooms-page state and template structure I shipped in commit `8544d9c`. Reuse the `var(--selected-tint)`, `var(--panel-soft)`, `--line` tokens and the `.bulk-bar` / `.bulk-bar.active` / `.bulk-select-all` / `.bulk-count` class names. Concrete deltas:
- `selectedFilenames = signal<ReadonlySet<string>>(new Set())`
- `selectedCount = computed(() => this.selectedFilenames().size)`
- `allOnPageSelected = computed(() => …)` matching rooms page
- `isSelected(filename)`, `toggleSelection(filename)`, `toggleSelectAllOnPage()`, `clearSelection()`, `bulkDeleteSelected()` — mirror rooms page
- Confirm dialog: `Delete N recording${plural}? This cannot be undone.`

The template adds a `.bulk-bar` above the recording list with select-all checkbox + delete-selected button (visible only when count > 0), and each `<li class="recording-row">` gets a checkbox column on the left. SCSS for `.recording-row` already has a grid template — add the leading `auto` column for the checkbox (same as rooms-page did).

**DO NOT** add a "Delete one" button per row — recordings currently don't have a single-delete UI either. Match the rooms-page parity where individual delete was already present.

Wait — recordings currently have NO delete UI at all. So this batch adds BOTH single-delete AND bulk-delete to recordings page. Add per-row Delete button mirroring rooms-page `.danger-btn`. Use the existing `DELETE /api/recordings/:filename` endpoint if it exists; if not, add it (mirror `DELETE /api/rooms/:id` shape — ownership-gated, 200 ok / 404 not found / 403 forbidden).

Actually check whether single-recording-delete already exists. If yes, just wire the row button to it; if no, add it as a small companion to the bulk endpoint.

### (5) E2E coverage

`e2e/tests/v3-fixb3-recordings/recordings-bulk-delete.spec.ts`:
- Sign in, navigate to `/app/recordings`, snapshot count
- Seed 2-3 throwaway recordings via direct API uploads (or fixtures) to ensure rows exist
- Tick 2 → assert "Delete selected (2)" appears + bar styled active
- Click Delete → confirm dialog → 2 rows gone, count decreased by 2
- Tick the last row + click single Delete button → assert that path also works

## Regression suite (mandatory)

- `npm test -w backend` — must be GREEN (includes new bulk-delete recording tests)
- `npm test -w e2e -- tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1` — **R8.1 still holds**
- New FIX-B3 spec — PASS

## Required artifacts

`plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixb/batch-fixb3/`:
1. `changes.md` (with verbatim user report)
2. `scenarios-implemented.md`
3. `test-report.md` (backend + targeted + Run 1 regression)
4. `review.md`
5. `independent-validation.md`
6. `screenshots/recordings-bulk-bar.png` — recordings page with rows selected + bulk bar visible
7. **Decision:** `decisions/2026-05-19-fixb3-recordings-bulk.md` covering: traversal-safety choice, ownership filter, single-delete added together

## Scope (hard limits)

- **DO** items 1-5 above.
- **DO NOT** touch transcript-tagging code — that's FIX-B2 (separate batch, dispatches after this one).
- **DO NOT** modify the recording upload/list code beyond what's needed for delete endpoints.

## Completion protocol

**COMMIT BEFORE STATUS: DONE.** Append to `progress.md`:
```
[projcore callback] fixb3 DONE — recordings bulk-delete + single-delete + tab UI
```

Then your `STATUS: DONE — FIX-B3 …` line.

— /projcore (Claude, Opus, 2026-05-19)
