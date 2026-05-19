# FIX-B3 Changes

## Source

JROM verbatim: "add to the capability as well a working record function and the file gets saved on the app. and a folder or tab on the ui shows these and can ba batch deleted as well. please add this to the task list"

## Scope Delivered

- Added authenticated `POST /api/recordings/bulk-delete` with 200-filename cap, traversal rejection, room ownership filtering, safe resolved-path checks, and ENOENT-as-skip behavior.
- Added authenticated `DELETE /api/recordings/:filename` for per-row delete, ownership-gated to the room owner.
- Added recordings service methods for single delete and bulk delete.
- Updated `/app/recordings` with the rooms bulk-delete pattern: row checkboxes, "Select all on page", active bulk bar, "Delete selected (N)", clear selection, status/error copy, and per-row Delete action.
- Added FIX-B3 backend and Playwright coverage, plus screenshot evidence for the active recordings bulk bar.

## Files Changed

- `backend/src/modules/recording/index.ts`
- `backend/tests/recording.test.ts`
- `frontend/src/app/services/recordings.service.ts`
- `frontend/src/app/pages/recordings/recordings.page.ts`
- `frontend/src/app/pages/recordings/recordings.page.html`
- `frontend/src/app/pages/recordings/recordings.page.scss`
- `e2e/tests/v3-fixb3-recordings/recordings-bulk-delete.spec.ts`
