# B00F — Harness-integrity fixes (B05 F2/F4)

Role: implementer L2 (haiku)
§4b: impl L2, val L2, delib no, redteam budget

## Scope
1. **F2:** `verifyStimulus` needs absolute minimum-signal floor — dead mic with noise floor n currently yields measuredGain≈0.5 → false PASS. Must return INVALID for dead/too-quiet baseline.
2. **F4:** port `harness/__tests__/call-ledger.test.ts` to real vitest suites so B01 assertions execute under `vitest run harness/`.
3. Optionally: fix or quarantine pre-existing mic-capture-health.spec.ts L120 stale assertion (MUST-TRACK from B08A-1 validator) if atomic and <5min — else leave for next slice.

## Acceptance
- Synthetic dead-mic stimulus → INVALID not PASS
- `vitest run harness/` green with call-ledger assertions executing
- Closes no AC

PROPOSED first → wait APPROVED-PLAN. Callbacks to callbacks.md.
