# FIX-B2 Scenarios Implemented

## Backend

- `FIX-B2.API.1` Upload metadata happy path writes `<recording>.meta.json`.
- `FIX-B2.API.2` Upload metadata rejects traversal filenames, nonexistent recordings, non-owned recordings, and bad schema versions.
- `FIX-B2.API.3` Recordings list returns `hasMetadata: true` and `speakerCount` when sidecar metadata exists.

## Frontend / E2E

- `FIX-B2.E2E.1` Single-peer recording creates audio plus sidecar metadata with one participant and valid duration.
- `FIX-B2.E2E.2` Two-peer recording captures both host and guest client ids in active-speaker segments.
- `FIX-B2.E2E.3` Mid-recording peer leave records `leftAtMs` for the guest while the host remains active.
- `FIX-B2.E2E.4` Recordings list exposes `hasMetadata`/`speakerCount` through API and displays `Speakers: 2` in the tab.

## Regression

- `R8.1` Run 1 desktop regression remains green across B3-B8 suites.
