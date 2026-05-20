# FIXC6 Ollama Transcript Cleanup Benchmark

## Input
- Transcript: `batch-fixc6/benchmark-input/transcript.json`
- Selection note: the specified JROM Test transcript and FIX-B4 synthetic fallback were too thin for meaningful ranking, so the committed synthetic 60-second multi-speaker transcript was used per the batch fallback rule.
- Ranking rule: accuracy first, speed as tiebreaker.

## Gold Summary
The team discussed how to roll out transcript cleanup for the meet prototype now that the shared provider abstraction can call Claude, Codex, and Ollama. They agreed that accuracy is more important than speed, but outputs taking over roughly one minute per transcript may be too slow for the first version. The group decided to benchmark five Ollama candidates and rank the top three by accuracy first, then speed. Leo will run the benchmark and write the ranking report, Nina will review the top outputs and choose a default model, and Omar will monitor CPU and memory during the first customer demo. No UI work is included in this batch; the deliverable is the benchmark report and installed models for the next cleanup feature.

## Gold Action Items
- Leo: Run the benchmark script, save every model output, and write the ranking document with timing and scoring notes.
- Nina: Review the top three outputs tomorrow and pick the default model for the transcript cleanup workflow.
- Omar: Monitor CPU and memory during the first customer demo and determine whether a smaller fallback model is needed.

## Ranking
| Rank | Model | Avg accuracy | Summary | Actions | Total seconds | Notes |
|---:|---|---:|---:|---:|---:|---|
| 1 | ★ mistral-nemo:12b | 5.0 | 5 | 5 | 58.1 | Most complete output; captured provider readiness, accuracy priority, speed concern, decision rule, non-scope, and all action items. |
| 2 | ★ gpt-oss:20b | 5.0 | 5 | 5 | 75.3 | Complete and faithful; slightly slower than mistral-nemo, so it loses the tie on speed. |
| 3 | ★ gemma2:9b | 4.5 | 4 | 5 | 37.7 | Fastest by a wide margin with accurate action items; summary missed provider-abstraction readiness and softened the no-UI deliverable wording. |
| 4 | phi4:14b | 4.5 | 4 | 5 | 66.4 | Excellent action items and concise summary, but the summary omitted provider-abstraction readiness and the explicit one-minute speed concern. |
| 5 | qwen2.5:14b-instruct | 4.0 | 4 | 4 | 57.0 | Clear and usable, but missed the provider-abstraction context, the one-minute speed threshold, and some action-item detail. |

## Outputs

### qwen2.5:14b-instruct
- Summary latency: 37.0s
- Action-items latency: 20.0s
- Total latency: 57.0s

Summary:

The meeting focused on the rollout of the transcript cleanup feature for the meet prototype, with key decisions made regarding model selection based on accuracy and speed. Engineering will benchmark five Ollama models, and product will review the top three to choose the default model. Additional monitoring will be conducted during the first customer demo to determine if a smaller fallback model is necessary. The current deliverables are limited to the benchmark report and the installation of selected models.

Action items:

- Leo: Run the benchmark script and write the ranking document
- Nina: Review the top three outputs and pick the default model
- Omar: Monitor CPU and memory during the first customer demo

### mistral-nemo:12b
- Summary latency: 39.2s
- Action-items latency: 18.9s
- Total latency: 58.1s

Summary:

The meeting discussed the rollout of the transcript cleanup feature for the meet prototype, focusing on selecting a default Ollama model. Engineering reported that the provider abstraction was ready, allowing Claude, Codex, and Ollama to be called through the same service. Product emphasized the importance of accuracy over speed. After testing, it was decided that models running over one minute per transcript would be too slow initially. The team agreed to benchmark five Ollama candidates today, with Maria deciding to prioritize accuracy first and speed second as tiebreakers. Leo will run the benchmark script and document the results, Nina will review the top three outputs and choose the default model, and Omar will monitor CPU and memory during the first customer demo. The only deliverable for this batch is the benchmark report and the installed models for the next cleanup feature, with no UI additions planned.

Action items:

- Leo: Run the benchmark script, save every model output, and write the ranking document with timing and scoring notes.
- Nina: Review the top three outputs tomorrow and pick the default model for the transcript cleanup workflow.
- Omar: Monitor CPU and memory during the first customer demo so we know whether we need a smaller fallback model.

### phi4:14b
- Summary latency: 40.6s
- Action-items latency: 25.7s
- Total latency: 66.4s

Summary:

The team discussed the rollout of the transcript cleanup feature for the meet prototype, focusing on selecting a suitable Ollama model. They decided to benchmark five Ollama candidates based on accuracy, with speed as a tiebreaker. Leo will run the benchmarks and document the results, while Nina will choose the default model after reviewing the top three outputs. Omar will monitor system performance during the first customer demo to assess the need for a fallback model. The deliverables will include the benchmark report and the installed models, with no UI additions in this batch.

Action items:

- Leo: Run the benchmark script, save every model output, and write the ranking document with timing and scoring notes.
- Nina: Review the top three outputs tomorrow and pick the default model for the transcript cleanup workflow.
- Omar: Monitor CPU and memory during the first customer demo to assess if a smaller fallback model is needed.

### gpt-oss:20b
- Summary latency: 46.7s
- Action-items latency: 28.5s
- Total latency: 75.3s

Summary:

During the meeting, the team agreed to focus on rolling out a transcript cleanup feature for the meet prototype, with engineering confirming provider abstraction is ready but still needing a default Ollama model. Product emphasized that accuracy is paramount, and Omar noted that models taking over a minute per transcript are too slow for an initial release. Maria decided to benchmark five Ollama candidates today and choose the top three based on accuracy, using speed as a tiebreaker. Leo will run the benchmarks and produce a ranking document, Nina will evaluate the top three outputs tomorrow to select the default model, and Omar will monitor CPU/memory usage during the first customer demo to determine if a smaller fallback model is required.

Action items:

- Leo: run the benchmark script, save every model output, and write the ranking document with timing and scoring notes.
- Nina: review the top three outputs tomorrow and pick the default model for the transcript cleanup workflow.
- Omar: monitor CPU and memory during the first customer demo so we know whether we need a smaller fallback model.

### gemma2:9b
- Summary latency: 22.3s
- Action-items latency: 15.4s
- Total latency: 37.7s

Summary:

The team decided to prioritize accuracy over speed when selecting a default Ollama model for the transcript cleanup feature.  Leo will benchmark five Ollama candidates, ranking them based on accuracy first and then speed. Nina will review the top three outputs and choose the default model, while Omar will monitor resource usage during the first customer demo. The focus for this iteration is on backend functionality, with no UI changes.

Action items:

- Leo: I will run the benchmark script, save every model output, and write the ranking document with timing and scoring notes.
- Nina: I will review the top three outputs tomorrow and pick the default model for the transcript cleanup workflow.
- Omar: I will monitor CPU and memory during the first customer demo so we know whether we need a smaller fallback model.
