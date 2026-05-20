# Batch FIXC6 — Ollama benchmark (top 3 by accuracy then speed)

**Persona:** Codex builder, `-s danger-full-access`. FIXC1-5 PASSED. R8.1 holds 15 consecutive batches. **COMMIT BEFORE STATUS: DONE.**

## Scope: requirement R-C-10

JROM verbatim:
> "yes try to generate a text and have them perform that task, pick top3 with rating of accuracy (first), speed 2nd"

Spec row:
- **R-C-10** Run the curated candidate set against a real transcript with a fixed prompt (summarize + extract action items). Rate each model by accuracy (1-5 subjective, judged against a hand-written gold-standard summary) then by wall-clock speed. Commit top-3 to `decisions/2026-05-19-fixc-ollama-benchmark.md`. Pull the 3 missing candidates via `ollama pull`. Models stay installed for FIXC7 use.

## Branch

```
git checkout -b fix/meet-fixc6-ollama-benchmark fix/meet-fixc5-llm-providers
```

## Candidate set (locked in discussion-phase decision D2)

| Model | Status pre-batch | Action |
|---|---|---|
| qwen2.5:14b-instruct | not installed (~9 GB) | `ollama pull qwen2.5:14b-instruct` |
| mistral-nemo:12b | not installed (~7.1 GB) | `ollama pull mistral-nemo:12b` |
| phi4:14b | already installed (9.1 GB) | use as-is |
| gpt-oss:20b | already installed (13 GB) | use as-is |
| gemma2:9b | not installed (~5.4 GB) | `ollama pull gemma2:9b` |

Total disk after pulls: ~43.6 GB (within the ~50 GB cap). Sequential pulls — do NOT parallelize (Ollama serializes downloads anyway).

## Input transcript

Use `recordings/2026-05-19T22-15-40-686Z_b262d250-8bf9-4264-b5c1-897101e6c9bd_180cce4e7f73_JROM_Test_9d12cb.webm.transcript.json` (the JROM Test recording — confirmed Ready in FIXC4 screenshot, 1:37 duration, 2 speakers, English content from the silent recording's transcription).

If that transcript JSON's `lines[]` content is too thin to differentiate model output quality (which it might be — original audio was silent), fall back to the synth-taglish fixture: `e2e/fixtures/audio/synth-taglish.webm` paired with its transcript JSON OR re-run transcription on `recordings/2026-05-19T...FIXB4_smoke_synth_2f0343.webm` (the FIX-B4 synthetic recording, ~13 seconds, 3 lines Ari/Bela/Ari).

If even those are too short for meaningful "summarize" output, **generate a synthetic 60-second multi-speaker transcript** (hand-written or stitched from public CC-BY conversation snippets) and commit it under `plan/.../benchmark-input/transcript.json`. Document the choice.

## Prompts

Fixed prompts applied to every model:

**Prompt A — Summarize:**
```
You are a meeting-notes assistant. The following is a transcript of a meeting between two or more participants. Produce a 3-5 sentence summary capturing the main topics discussed and any decisions made. Return only the summary text, no preamble.

Transcript:
<full text from lines[]>
```

**Prompt B — Action items:**
```
You are a meeting-notes assistant. The following is a transcript of a meeting between two or more participants. Extract any concrete action items as a bullet list. Each bullet should be `- <person>: <action>`. If no action items exist, return exactly `(none)`. Return only the list, no preamble.

Transcript:
<full text from lines[]>
```

## Hand-written gold standard

Before running benchmarks, hand-write the "correct" outputs for the chosen transcript and commit them to `plan/.../benchmark-input/gold-summary.md` and `plan/.../benchmark-input/gold-actions.md`. Use them to score each model 1-5 on accuracy:

- **5** — captures all key points, no fabrications, fluent
- **4** — captures most key points, no major fabrications
- **3** — captures gist but misses some points or has minor confusion
- **2** — significant misses or one major fabrication
- **1** — wrong or hallucinated

## Runner

Create `backend/scripts/benchmark-llm.ts` (or `.mjs`) that:

1. Reads the transcript JSON
2. Reads gold summary + actions from the input folder
3. For each model in the candidate list:
   - Invokes `LlmService.get('ollama').invoke({model, prompt: <A>})` and measures wall-clock ms
   - Same for prompt B
   - Captures both outputs to `plan/.../benchmark-runs/<model-safe-name>/{summary.txt, actions.txt, timing.json}`
4. After all runs, write a side-by-side comparison report at `plan/.../decisions/2026-05-19-fixc-ollama-benchmark.md` with:
   - Each model's summary + actions
   - Manual accuracy scores (codex assigns these by reading each output against the gold)
   - Speed in seconds
   - Final ranking: accuracy first, speed as tiebreaker
   - Top 3 with stars and short justification

Run sequentially. Pull-as-needed: skip pull if `ollama show <model>` succeeds.

## Required artifacts at `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc6/`

1. `changes.md`
2. `scenarios-implemented.md`
3. `test-report.md` (each `ollama pull` exit code + each invocation latency)
4. `review.md`
5. `independent-validation.md` (placeholder)
6. `benchmark-input/transcript.json` (whichever input you used, copied for reproducibility)
7. `benchmark-input/gold-summary.md`
8. `benchmark-input/gold-actions.md`
9. `benchmark-runs/<model-safe-name>/` (5 folders, one per model)
10. `decisions/2026-05-19-fixc-ollama-benchmark.md` (the final ranking — important: this is at the projcore-run root `decisions/` folder, NOT batch-fixc6/decisions/)

## Build + deploy

- No backend or frontend code changes expected (FIXC6 is benchmarking only; runner is a script, not a deployed endpoint)
- Backend tests still PASS (regression check)
- No PM2 restart needed
- `ollama list` confirms the 5 models present afterward

## Validation gates (your self-checks)

- [ ] Tree clean before STATUS: DONE
- [ ] All 3 missing pulls succeeded (qwen2.5:14b-instruct, mistral-nemo:12b, gemma2:9b)
- [ ] All 5 models invoked successfully for both prompts (10 invocations total)
- [ ] `decisions/2026-05-19-fixc-ollama-benchmark.md` written with top-3 ranking
- [ ] `npm test -w backend` PASS (regression)
- [ ] Run 1 e2e regression PASS — must hold; R8.1's 16th consecutive batch

## Time budget

Expect ~30-60 min wall time:
- 3 pulls × ~3-8 min each (depends on connection) = 10-25 min
- 10 invocations × ~10-60 sec each (CPU inference) = 5-15 min
- Doc writing = 5-10 min
- Validation = 5 min

If a single pull takes >15 min, stop the pull and substitute a smaller model (e.g., `llama3.2:3b`). Document the substitution.

## Completion

End with STATUS: DONE. The benchmark report itself is the deliverable — JROM will skim the top-3 ranking and pick a default.
