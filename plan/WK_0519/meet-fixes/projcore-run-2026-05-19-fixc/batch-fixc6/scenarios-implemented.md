# Batch FIXC6 Scenarios Implemented

## R-C-10 Ollama Benchmark
- Pulled missing locked candidates:
  - `qwen2.5:14b-instruct`
  - `mistral-nemo:12b`
  - `gemma2:9b`
- Confirmed already-installed candidates:
  - `phi4:14b`
  - `gpt-oss:20b`
- Used the fixed prompts for summary and action-item extraction.
- Ran all five candidates through the real Ollama HTTP provider path in `LlmService`.
- Captured per-model outputs and wall-clock timings.
- Scored each model manually against committed gold outputs.
- Ranked by average accuracy first and total speed as the tiebreaker.

## Final Top Three
1. `mistral-nemo:12b`
2. `gpt-oss:20b`
3. `gemma2:9b`

## Non-Scope Held
- No application endpoint changes.
- No UI changes.
- No PM2 restart.
- No default model setting was changed.
