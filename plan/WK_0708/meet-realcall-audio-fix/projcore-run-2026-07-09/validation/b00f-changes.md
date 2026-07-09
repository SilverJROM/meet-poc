# B00F Harness-Integrity Fixes — Changes

**Role:** Implementer L2 (haiku)  
**Date:** 2026-07-09  
**Commit:** 7ec6151

## Summary

Three surgical fixes to harness integrity:

1. **F2: verifyStimulus min-signal floor** — added absolute baseline floor (0.01) to reject dead-mic false passes
2. **F4: Call-ledger ported to vitest** — converted custom test harness to proper vitest suites
3. **F3: L120 assertion fixed** — corrected stale test expectation to match implementation

## Changes

### F2: e2e/harness/gum-shim.ts

Added `MIN_BASELINE = 0.01` constant to reject baselines below floor (dead/noise-only mics).

Updated `verifyStimulus()` to check: `baselineLevel < MIN_BASELINE` → returns `undefined` (INVALID).

**Test:** Added dead-mic scenario to gum-shim.test.ts: noise-floor baseline (0.005) with attenuated (0.0025) measuredGain≈0.5 → now returns INVALID not PASS. ✓

Commit: gum-shim.ts (1 constant, 1 condition added; 1 new test)

### F4: e2e/harness/__tests__/call-ledger.test.ts

Ported entire manual test harness to vitest format:
- Replaced custom `test()` / `assert()` → vitest `describe` / `it` / `expect`
- Organized 19 tests into 9 describe blocks (protected-ID, uncaptured, registered, budget, gate, persistence, empty/whitespace, immutability, state)
- `beforeEach` / `afterEach` hooks for tmpDir setup/cleanup

Execution: `vitest run e2e/harness/__tests__/call-ledger.test.ts` ✓ 19 tests PASS

Commit: call-ledger.test.ts (complete rewrite to vitest)

### F3: frontend/src/app/services/mic-capture-health.spec.ts L120

Corrected stale assertion. Test case had frozen level (0.4 across 6 samples) + flat energy (5.0 → 5.0):
- **Old:** `notStrictEqual(..., 'silent')` — expected NOT silent
- **New:** `strictEqual(..., 'silent')` — correctly expects silent (frozen level + flat energy closes frozen-frozen-detector gap)

Comment updated to clarify intent: "Frozen level + flat energy → SILENT (even with high audioLevel; closes frozen-frozen-detector gap)"

File validation: `npx vitest run ...` runs full suite; mic-capture-health assertions execute and pass. ✓

Commit: mic-capture-health.spec.ts (1 assertion corrected + comment clarified)

## Test Results

```
e2e/harness/__tests__/gum-shim.test.ts       12 passed (including new dead-mic test)
e2e/harness/__tests__/call-ledger.test.ts    19 passed (all ported tests)
e2e/harness/__tests__/ (all suites)           90 passed total
```

## Acceptance Criteria

- [x] F2: Synthetic dead-mic stimulus → INVALID not PASS
- [x] F4: `vitest run harness/` green with call-ledger assertions executing
- [x] F3: L120 assertion atomic fix applied (<5min)
- [x] No AC closure (per scope)
