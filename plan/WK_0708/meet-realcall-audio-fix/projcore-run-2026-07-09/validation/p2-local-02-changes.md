# P2-LOCAL-02: AC1 Local Math Validation

## Summary

Unit-proven auto-gain computation for 2-party (no-op) and multi-party (boost) scenarios. No SFU, no live browser tests.

## Current Implementation

File: `frontend/src/app/services/remote-audio.service.ts::computeRemoteAutoGains()`

**Constants:**
```
AUTO_LEVEL_TARGET_RATIO = 0.88
AUTO_LEVEL_NOISE_FLOOR = 0.003
AUTO_LEVEL_MAX_GAIN = 2.5
AUTO_LEVEL_SMOOTHING = 0.35
```

**Formula:**
```
loudest = max(usable audioLevel samples)
for each sample:
  if sample.audioLevel >= NOISE_FLOOR && loudest > 0:
    raw = max(1, min(MAX_GAIN, (loudest * TARGET_RATIO) / sample.audioLevel))
  else:
    raw = 1.0
  smoothed = prev_gain + (raw - prev_gain) * SMOOTHING
```

## AC1 Proof: 2-Party Unity (No-Op)

**Requirement:** Single remote → gain ≈ 1.0 (loudest is the remote itself)

**Calculation:**
```
loudest = r (the remote's level)
raw = max(1, min(2.5, (r * 0.88) / r)) = max(1, 0.88) = 1.0
smoothed = 1.0 + (1.0 - 1.0) * 0.35 = 1.0
```

**Tested levels:** {0.5, 0.3, 0.2, 0.1, 0.05, 0.02} — all yield A ≈ 1.0 ✓

## Multi-Party Boost Table

**Scenario:** Two remotes, loudest=0.5, varying quiet level `r`

First call smoothing: `smoothed = prev + (raw - prev) * 0.35`, with `prev=1` by default.

| r (quiet) | raw gain | smoothed (from prev=1) | interpretation |
|-----------|----------|------------------------|-----------------|
| 0.1       | 2.5      | 1.525                  | Quietest: boosted from 1.0→1.525 over time |
| 0.2       | 2.2      | 1.42                   | Boost toward 2.2x over samples |
| 0.3       | 1.47     | 1.165                  | Moderate boost for 0.3 level |
| 0.4       | 1.1      | 1.035                  | Minimal boost near loudest |
| 0.5       | 1.0      | 1.0                    | Equal to loudest (2-party unity) |
| 0.6       | 1.0      | 1.0                    | Clipped below target |

**Key insight:** The formula is: `A = min(MAX_GAIN, max(unity, loudest·target_ratio/r))`

For `loudest=0.5, target_ratio=0.88`:
- Target gain = 0.5 * 0.88 = 0.44
- If r ≥ 0.44: raw = 1.0 (clamped to minimum unity)
- If r < 0.44: raw = 0.44 / r, then capped at MAX_GAIN=2.5

Smoothing (α=0.35) converges raw→target over ~5 samples, preventing abrupt volume changes.

## Noise Floor Behavior

**Levels below 0.003 are filtered out:**
- Not included in loudest calculation
- Still receive gain=1.0 (bypass branch)

**Example:** {0.002, 0.5} → loudest from {0.5}, both get A=1.0

## Smoothing Over Time

Exponential smoothing (α=0.35) converges raw→target over ~5 samples. After first boost from 1.0→2.5:
```
sample 1: 1.0 + (2.5 - 1.0) * 0.35 = 1.525
sample 2: 1.525 + (2.5 - 1.525) * 0.35 ≈ 1.865
sample 3: 1.865 + (2.5 - 1.865) * 0.35 ≈ 2.089
sample 4: 2.089 + (2.5 - 2.089) * 0.35 ≈ 2.232
sample 5: 2.232 + (2.5 - 2.232) * 0.35 ≈ 2.326
```

## Test Coverage

**File:** `e2e/harness/__tests__/remote-auto-gain.test.ts`

- 2-party no-op: 6 levels
- Multi-party 2-peer boost
- Multi-party 3-peer boost (max-gain clamp)
- Noise floor filtering
- Non-finite / null levels
- Smoothing convergence
- Max-gain clamp edge cases
- Formula table validation: 6 r-values against expected A

**Test execution:**
```bash
cd /home/agjrom/websites/meet-poc
npm run test -- e2e/harness/__tests__/remote-auto-gain.test.ts --config e2e/vitest.config.ts
```

## Verdict

✅ **AC1 2-party unity proven:** gain ≈ 1.0 for single remote at all usable levels.
✅ **Multi-party boost characterized:** quieter peers boosted up to 2.5x.
✅ **Noise floor working:** sub-0.003 samples ignored in loudest calc.
✅ **Ready for B09 live testing:** math validated locally; no SFU or browser changes needed for this batch.

## Next Steps

**B09 (future):** Implement absolute-target fix if needed after live multi-party validation on real devices.
