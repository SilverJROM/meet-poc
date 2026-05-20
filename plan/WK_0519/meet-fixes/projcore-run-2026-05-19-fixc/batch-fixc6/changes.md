# Batch FIXC6 Changes

## Scope
- branch: fix/meet-fixc6-ollama-benchmark
- requirement: R-C-10 Ollama benchmark

## Files Changed
- backend/scripts/benchmark-llm.ts
- plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/prompts/batch-fixc6.md
- plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc6/benchmark-input/transcript.json
- plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc6/benchmark-input/gold-summary.md
- plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc6/benchmark-input/gold-actions.md
- plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc6/benchmark-runs/*/{summary.txt,actions.txt,timing.json}
- plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc6/manual-scores.json
- plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/decisions/2026-05-19-fixc-ollama-benchmark.md

## What Changed
- Added a reproducible Ollama benchmark runner that invokes the FIXC5 `LlmService` Ollama provider for the locked five-model candidate set.
- Pulled the three missing models: `qwen2.5:14b-instruct`, `mistral-nemo:12b`, and `gemma2:9b`.
- Committed a synthetic 60-second multi-speaker transcript because the specified real transcript and fallback fixture were too thin for meaningful summary/action-item scoring.
- Wrote hand-authored gold summary and action-item outputs before scoring.
- Ran all five models against the fixed summary and action-item prompts, captured outputs and timings, manually scored accuracy, and wrote the final top-three decision report.

## Self-Verification
- `ollama list`: PASS, all five benchmark candidates present
- `npm run build -w backend`: PASS
- `npm exec -w backend -- tsx scripts/benchmark-llm.ts`: PASS, 10 invocations completed
- `npm exec -w backend -- tsx scripts/benchmark-llm.ts --report-only`: PASS, final scored report regenerated
- `npm test -w backend`: PASS, 81 passed / 1 skipped
- Run 1 e2e regression: PASS, 58/58

## Reproduction Notes
- before: no benchmark runner, reproducible benchmark input, per-model outputs, or ranked Ollama decision existed.
- after: top three are recorded at `decisions/2026-05-19-fixc-ollama-benchmark.md` with raw output and timing evidence under `batch-fixc6/benchmark-runs/`.

## Caveats
- The benchmark input is synthetic per the brief fallback rule; the real JROM Test transcript was mostly mic-test fragments and not suitable for meaningful ranking.
