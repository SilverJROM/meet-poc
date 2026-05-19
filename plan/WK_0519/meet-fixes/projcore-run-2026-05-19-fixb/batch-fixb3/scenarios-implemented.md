# FIX-B3 Scenarios Implemented

## API

- `FIX-B3.API.1` Bulk delete with two owned recordings, one other-owner recording, one bogus-room recording, and one traversal attempt returns `{ ok: true, deleted: 2, requested: 5 }`.
- `FIX-B3.API.2` Bulk delete rejects a missing `filenames` array with `400 { error: 'filenames array required' }`.
- `FIX-B3.API.3` Bulk delete accepts an empty array and returns `{ ok: true, deleted: 0, requested: 0 }`.
- `FIX-B3.API.4` Single delete removes owned recordings, returns 403 for other-owner recordings, and rejects traversal paths.

## UI

- `FIX-B3.UI.1` Recordings page shows checkboxes for rows and a "Select all on page" control.
- `FIX-B3.UI.2` Selecting two recordings activates the bulk bar and shows `Delete selected (2)`.
- `FIX-B3.UI.3` Confirmed bulk delete removes the selected recordings from the tab.
- `FIX-B3.UI.4` Per-row Delete action removes the remaining recording through the single-delete endpoint.

## Regression

- `R8.1` Run 1 desktop regression remains green across B3-B8 suites.
