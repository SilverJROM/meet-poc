# P2-LOCAL-03: AC1 Stimulus Path — r-Grid Verification

## Summary

Extended `e2e/harness/__tests__/gum-shim.browser.test.ts` to verify the D19 forced-mode GainNode attenuation across the full AC1 r-grid: `{0.50, 0.30, 0.20, 0.10, 0.05}`. All measurements verified within ±20% tolerance on real Chromium fake-device, with no room join or SFU interaction.

## Changes Made

### File: `e2e/harness/__tests__/gum-shim.browser.test.ts`

**Added**: New test case `r-grid {0.50, 0.30, 0.20, 0.10, 0.05}: AC1 stimulus path verification across forced weak-signal gains`

- Captures a single baseline RMS value (no shim).
- Iterates through the r-grid sequentially: `[0.5, 0.3, 0.2, 0.1, 0.05]`.
- For each r value:
  - Injects `gumShimInitScript(r)` into a fresh browser context.
  - Calls `getUserMedia()` on the fake device (looped real speech WAV: `bot-140/hello.wav`).
  - Captures RMS over ~480ms via downstream AnalyserNode.
  - Verifies computed gain via `computeStimulusVerification()`.
  - Validates against `RecordingArbiter` (arbiter must report `PASS`).
  - Asserts `withinTolerance: true` for every r point.
- Reusable baseline across all r values (no re-capture per gain).
- Sequential execution respects `vitest` maxForks limit (3).
- Single test file, single vitest run.

**Preserved**: Original r=0.50 test unchanged (historical baseline + invalid-control validation).

## Test Coverage

| r Value | Intended | Measured (±20%) | Status |
|---------|----------|-----------------|--------|
| 0.50    | 0.50     | ✓ within range  | PASS   |
| 0.30    | 0.30     | ✓ within range  | PASS   |
| 0.20    | 0.20     | ✓ within range  | PASS   |
| 0.10    | 0.10     | ✓ within range  | PASS   |
| 0.05    | 0.05     | ✓ within range  | PASS   |

## Validation Evidence

- **Test run**: `npx vitest run --config e2e/vitest.config.ts e2e/harness/__tests__/gum-shim.browser.test.ts`
- **Result**: Both tests passed (r=0.50 control + r-grid).
- **Duration**: ~5.68s total (120s timeout budgeted).
- **Invalid control verified**: Missing baseline correctly surfaces as `INVALID`, not false `PASS`.
- **No product FE change**: Test harness only.
- **No rooms created**: Throwaway local HTTP server, no room join, no SFU.
- **Temp cleanup**: No /tmp artifacts created.

## Commit

Atomic change to extend test coverage per AC1 requirement. Previous commit P2-LOCAL-02 (8044d45) verified 2-party auto-gain + CAP25 at r=0.50; this batch extends proof to full r-grid on fake-device local Chromium.

---

**Status**: VERIFIED ✓
