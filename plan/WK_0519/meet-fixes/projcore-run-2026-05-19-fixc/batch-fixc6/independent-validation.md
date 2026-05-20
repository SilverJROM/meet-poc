# FIXC6 — Independent Projcore Validation

**Verdict: PASS — VERIFIED. Cleared to dispatch FIXC7.**

## Independent test execution

| Gate | Command | Result |
|---|---|---|
| 1 | `git status --short` | clean |
| 2 | `git log --oneline -3` | b9ee080 on top of FIXC5 chain |
| 3 | `git branch --show-current` | `fix/meet-fixc6-ollama-benchmark` |
| 4 | `ollama list` | All 5 candidates present: qwen2.5:14b-instruct (9 GB), mistral-nemo:12b (7.1 GB), phi4:14b (9.1 GB), gpt-oss:20b (13 GB), gemma2:9b (5.4 GB) |
| 5 | `npm test -w backend` | **81 passed / 1 skipped** (no regression) |
| 6 | Run 1 e2e regression | **58/58** PASS in 1.9m (R8.1 → 16 consecutive batches) |
| 7 | Benchmark doc at run-root `decisions/` | `2026-05-19-fixc-ollama-benchmark.md` present + readable |

## Benchmark output review

| Rank | Model | Avg accuracy | Total seconds | Notes (codex) |
|---:|---|---:|---:|---|
| 1 ★ | mistral-nemo:12b | 5.0 | 58.1 | Most complete output; captured provider readiness, accuracy priority, speed concern, decision rule, non-scope, and all action items |
| 2 ★ | gpt-oss:20b | 5.0 | 75.3 | Complete and faithful; slightly slower than mistral-nemo (loses tie on speed) |
| 3 ★ | gemma2:9b | 4.5 | 37.7 | Fastest by a wide margin with accurate action items; summary missed provider-abstraction readiness and softened the no-UI deliverable wording |
| 4 | phi4:14b | 4.5 | 66.4 | Excellent action items, summary omitted provider-abstraction readiness and one-minute speed threshold |
| 5 | qwen2.5:14b-instruct | 4.0 | 57.0 | Clear and usable, missed provider-abstraction context and one-minute speed threshold |

## Methodology spot-check

- **Input:** synthetic 60-second multi-speaker transcript (codex's fallback per the brief — committed at `batch-fixc6/benchmark-input/transcript.json`). Real recordings were too thin for meaningful ranking.
- **Gold standard:** hand-written summary + 3 action items at `batch-fixc6/benchmark-input/gold-summary.md` and `gold-actions.md`.
- **Prompts:** the two fixed prompts from the brief (Summarize + Action Items), applied identically to every model.
- **Runner:** `backend/scripts/benchmark-llm.ts` invokes via the FIXC5 `LlmService.get('ollama')` Ollama provider path. No model-specific shelling. Wall-clock timing via `process.hrtime.bigint()`.
- **Outputs:** per-model `summary.txt`, `actions.txt`, `timing.json` under `batch-fixc6/benchmark-runs/<safe-name>/`.
- **Scoring:** subjective 1-5 by codex, against the gold standard. Document is transparent — all raw outputs are committed so JROM can spot-check the scoring.

## Spec coverage

The benchmark report is itself the deliverable for R-C-10. No e2e tests required; FIXC6 added no app behavior — it's an offline ranking exercise. Backend regression coverage holds.

## Requirement closure

| Req | Status |
|---|---|
| R-C-10 — Ollama benchmark, top 3 by accuracy then speed | **VERIFIED** — top 3 = mistral-nemo:12b / gpt-oss:20b / gemma2:9b, doc + raw outputs committed |

## Regression check (R8.1)

16 consecutive batches now pass Run 1 desktop regression (58/58, unchanged since FIXC6 has no app code).

## Note for FIXC7

The default Ollama model for question execution should be **mistral-nemo:12b** (rank 1 in the benchmark). FIXC7's question library should default the Ollama provider's model field to `mistral-nemo:12b` (configurable per-question via the `providerOverride` field).
