# Batch FIXC6 Test Report

## Model Pulls
- `timeout 15m ollama pull qwen2.5:14b-instruct`
  - Result: PASS, exit code 0
- `timeout 15m ollama pull mistral-nemo:12b`
  - Result: PASS, exit code 0
- `timeout 15m ollama pull gemma2:9b`
  - Result: PASS, exit code 0
- `ollama list`
  - Result: PASS
  - Confirmed candidates: `qwen2.5:14b-instruct`, `mistral-nemo:12b`, `phi4:14b`, `gpt-oss:20b`, `gemma2:9b`

## Benchmark Invocations
- Command: `npm exec -w backend -- tsx scripts/benchmark-llm.ts`
- Result: PASS
- Total invocations: 10

| Model | Summary seconds | Action seconds | Total seconds |
|---|---:|---:|---:|
| `qwen2.5:14b-instruct` | 37.0 | 20.0 | 57.0 |
| `mistral-nemo:12b` | 39.2 | 18.9 | 58.1 |
| `phi4:14b` | 40.6 | 25.7 | 66.4 |
| `gpt-oss:20b` | 46.7 | 28.5 | 75.3 |
| `gemma2:9b` | 22.3 | 15.4 | 37.7 |

## Scoring
- Command: `npm exec -w backend -- tsx scripts/benchmark-llm.ts --report-only`
- Result: PASS
- Report: `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/decisions/2026-05-19-fixc-ollama-benchmark.md`

## Regression
- `npm run build -w backend`
  - Result: PASS
- `npm test -w backend`
  - Result: PASS
  - Count: 81 passed, 1 skipped
- Run 1 e2e regression
  - Command: `npm test -w e2e -- tests/v3-fixc4-transcript-tools tests/v3-fixc3-share-reflow tests/v3-fixc2-device-modal tests/v3-fixc1-camera-light tests/v3-fixb4-transcripts tests/v3-fixb2-transcript tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1`
  - Result: PASS
  - Count: 58 passed
