# Batch B1b — Independent Validation Checklist

Validator: codex55 (artifact-proof)

## Repro steps

```bash
cd backend
npm run build          # expect exit 0
npm test               # expect 175 passed
npm test -- tests/recording.test.ts -t "B1b"  # expect 4 passed
```

## Artifact proof

| Artifact | Path |
|----------|------|
| Scenarios | `plan/WK_0623/projcore-run-2026-06-23/batch-B1b/scenarios.md` |
| Changes | `plan/WK_0623/projcore-run-2026-06-23/batch-B1b/changes.md` |
| Test report | `plan/WK_0623/projcore-run-2026-06-23/batch-B1b/test-report.md` |
| Review | `plan/WK_0623/projcore-run-2026-06-23/batch-B1b/review.md` |

## Key files to inspect

- `backend/src/modules/recording/openrouter-transcribe.ts` — OpenRouter POST + normalization
- `backend/src/modules/recording/transcript-versions.ts` — version paths + primary pointer
- `backend/src/modules/recording/index.ts` — endpoints + spawn routing
- `backend/tests/recording.test.ts` — B1b mocked tests (lines tagged `B1b`)

## Pass criteria

1. `tsc` clean
2. All B1b tests pass without `OPENROUTER_API_KEY` set (mocked fetch)
3. Normalized transcript has owner-only names (no `?`)
4. Version list/delete/primary endpoints behave per scenarios.md
5. No API key in source, logs, or test fixtures