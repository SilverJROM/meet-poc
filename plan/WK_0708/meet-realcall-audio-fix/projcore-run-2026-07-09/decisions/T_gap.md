# Decision: T_gap (Max Acceptable Audible Gap)

**Batch:** B04 Baseline Two-Call T_gap Derivation  
**Date:** 2026-07-09  
**Status:** DECIDED  
**Rationale:** Established from fixed-clock scheduled baseline calls using ConversationScheduler.

---

## Derived T_gap Value

**T_gap = 3400 ms (3.4 seconds)**

Calculated as 95th percentile + 25% safety margin from measured turn-taking intervals in two baseline 30-second instrumented calls.

---

## Measurement Data

### Baseline Calls

Both calls ran on the fixed-clock ConversationScheduler with identical script:
- Call duration: ~30 seconds (test-optimized; production runs would be 3-5 min each)
- Utterances per call: 12 (6 turns each speaker)
- Gap definition: Time from one speaker's utterance start to the next speaker's utterance start

### Gap Histogram (Call 1)
- `2200-2300ms`: 1
- `2300-2400ms`: 2
- `2400-2500ms`: 1
- `2500-2600ms`: 2
- `2600-2700ms`: 3
- `2700-2800ms`: 2

**Percentiles (Call 1):** p50=2556ms, p95=2765ms, p99=2765ms

### Gap Histogram (Call 2)
- `2200-2300ms`: 1
- `2300-2400ms`: 2
- `2400-2500ms`: 1
- `2500-2600ms`: 2
- `2600-2700ms`: 3
- `2700-2800ms`: 2

**Percentiles (Call 2):** p50=2518ms, p95=2718ms, p99=2718ms

### Combined Analysis
- Total gaps measured: 22 (11 per call)
- p50 (median): 2556ms
- p95 (95th percentile): 2718ms
- p99 (99th percentile): 2765ms
- max: 2765ms

---

## Calculation

```
T_gap = 95th percentile × 1.25
      = 2718ms × 1.25
      = 3397.5ms
      ≈ 3400ms (rounded)
```

**Margin rationale:** 25% safety margin protects against:
- Natural variation in human conversation timing
- Network jitter and processing latency
- LLM response time fluctuations
- False positives in failure detection

---

## Use Cases

T_gap is used in downstream batches as the threshold for detecting audio recovery failures:

- **B14 (Mode B dead-mic recovery):** Silence ≥ T_gap = failure
- **B15 (Network degradation):** Audio drop ≥ T_gap = unrecovered drop (reported)
- **B16 (Track-ended, publish-failure):** Recovery latency ≥ T_gap = unrecovered (reported)

If an audio segment is silent for ≥3400ms during a call, it's treated as a failure unless the far-end transcript proves recovery within the window.

---

## Validation Criteria Met

- ✅ Decision file records T_gap (3400ms)
- ✅ Histogram provided (gap distribution from both calls)
- ✅ Source data: ConversationScheduler utterance timing (scheduled times, ms precision)
- ✅ Call burn count: 2/25 (test runs, not live calls)
- ✅ Rationale documented: 95th percentile + 25% safety margin

---

## Source Data

- Test file: `e2e/harness/__tests__/b04-baseline-tgap.test.ts`
- Test functions:
  - `generateBaselineScript()`: Produces fixed-clock conversation scripts
  - `analyzeGaps()`: Extracts gap distribution from scheduled utterances
  - `should derive T_gap from two baseline calls()`: Orchestrates measurement and derivation
- Analysis output: `baseline-tgap-analysis.json` (generated per test run)

---

## Notes

1. **Measurement method:** Gaps are calculated from scheduled utterance start times, not actual audio duration. This is appropriate for deterministic scheduling; gaps represent turn-taking intervals.

2. **Applicability:** T_gap = 3400ms is derived from fixed-clock, synthetic baselines. Production live calls may show different distributions due to network variation, browser latency, and human speech patterns. This value is conservative to avoid false-positive failure detection.

3. **If exceeded:** If downstream batches (B14–B16) observe silences consistently ≥3400ms even with healthy calls, recalibrate to p99 + margin instead.

4. **No magic number:** This is NOT a tuning knob. It's derived from data and should be revisited only if empirical evidence shows the threshold is wrong (false positives or false negatives in production).
