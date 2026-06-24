# Batch B1c — Test Report

## Build

| Surface | Command | Result |
|---------|---------|--------|
| Frontend | `cd frontend && npm run build` | PASS |

## UI proof (Playwright)

| Test | Command | Result |
|------|---------|--------|
| Versions panel DOM | `cd e2e && npx playwright test tests/b1c-transcript-versions/transcript-versions.spec.ts` | PASS — 1/1 |

### DOM assertions verified

- [x] Versions panel visible with `local / small` and `local / medium` labels
- [x] Primary badge on primary version
- [x] Set primary button on non-primary version
- [x] Delete buttons (×2)
- [x] Add transcription button + provider/model selects
- [x] Main viewer header reflects primary (`local / small`)

### Screenshot

`plan/WK_0623/projcore-run-2026-06-23/batch-B1c/screenshots/transcript-versions-panel.png`