# Batch B1c — Independent Validation Checklist

Validator: codex55 (UI-PROOF)

## Repro steps

```bash
cd frontend && npm run build   # expect exit 0

cd e2e && npx playwright test tests/b1c-transcript-versions/transcript-versions.spec.ts
# expect 1 passed
```

## Artifact proof

| Artifact | Path |
|----------|------|
| Scenarios | `plan/WK_0623/projcore-run-2026-06-23/batch-B1c/scenarios.md` |
| Changes | `plan/WK_0623/projcore-run-2026-06-23/batch-B1c/changes.md` |
| Test report | `plan/WK_0623/projcore-run-2026-06-23/batch-B1c/test-report.md` |
| Review | `plan/WK_0623/projcore-run-2026-06-23/batch-B1c/review.md` |
| Screenshot | `plan/WK_0623/projcore-run-2026-06-23/batch-B1c/screenshots/transcript-versions-panel.png` |

## Key files to inspect

- `frontend/src/app/services/recordings.service.ts` — 4 B1b client methods
- `frontend/src/app/pages/transcripts/transcripts.page.{ts,html,scss}` — versions panel UI
- `e2e/tests/b1c-transcript-versions/transcript-versions.spec.ts` — rendered-DOM proof

## Pass criteria

1. `ng build` clean
2. Playwright test passes; screenshot shows versions list + add/delete/set-primary controls + Primary badge
3. No backend files modified
4. Service methods match B1b API shapes (DELETE uses query params)