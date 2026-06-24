# Batch B1b — Test Report

## Build / typecheck

| Surface | Command | Result |
|---------|---------|--------|
| Backend TS | `npm run build` (tsc) | PASS |

## Backend tests

| Suite | Command | Result |
|-------|---------|--------|
| Full vitest | `npm test` | PASS — 175 passed, 1 skipped |
| B1b targeted | `tests/recording.test.ts` B1b cases | PASS — 4/4 |

### B1b test cases (mocked, no live OpenRouter key)

```
✓ B1b normalizes mocked OpenRouter output with owner-only labels
✓ B1b mocked OpenRouter HTTP writes a versioned owner-labeled transcript
✓ B1b missing OPENROUTER_API_KEY is a logged no-op that never errors transcribe
✓ B1b versioned transcripts coexist, delete one, and primary resolves
```

### Assertions verified

- [x] OpenRouter response normalized to `{lines, words}` with owner labels, `provider` + `model` recorded
- [x] Zero `?` speaker names in normalized output
- [x] Missing `OPENROUTER_API_KEY` → warn + skip, API still 200, no lock leak
- [x] Two version sidecars coexist; delete one leaves other; primary pointer resolves GET
- [x] Local transcribe writes `local-<model>` versioned path
- [x] Legacy `.transcript.json` still readable via primary fallback (existing B1a named-transcript test)