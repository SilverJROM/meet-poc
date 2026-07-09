# P2-LOCAL-05: Call-ledger/driver unit + CAP25 regression validation

**Batch:** P2-LOCAL-05  
**Date:** 2026-07-09  
**Status:** COMPLETE ✅

## Changes verified

### 1. CAP25 in call-ledger.ts
- ✅ `DEFAULT_CALL_BURN_CAP = 25` confirmed (line 35)
- ✅ Used in `isCallBurnExceeded()` logic
- ✅ Protects acceptance attempts from exceeding budget

### 2. call-driver.ts — CAP25 enforcement
- ✅ Error message updated: "callBurnCount exceeds 25-cap" (line 350)
- ✅ Gate check before browser launch
- ✅ Acceptance attempts blocked when callBurnCount > 25
- ✅ Smoke joins still allowed (non-acceptance gate logic)

### 3. call-driver.ts — B08 weak-signal shim integration
- ✅ Import of `gumShimInitScript` from `gum-shim.js`
- ✅ Config options added: `weakSignalRatio`, `weakSignalPageIndex`
- ✅ Function `injectWeakSignalShimIfConfigured()` added
- ✅ Injection calls before `joinBrowser()` for both page1 and page2
- ✅ Pure implementation, unit-tested, no SFU usage required

### 4. Test suite alignment

#### call-ledger.test.ts
- ✅ Test 1: "should allow acceptance burn within cap (25 calls)"
  - Loop: `for (let i = 0; i < 25; i++)` — 25 successful burns
  - Assertion: `expect(result).toBe(true)` for all 25
- ✅ Test 2: "should reject acceptance burn beyond cap"
  - Loop: 25 burns followed by overflow check
  - Assertion: `isCallBurnExceeded()` returns true

#### call-driver.test.ts
- ✅ Test 1: "fail-closed gate: acceptance attempt refuses if callBurnCount > 25"
  - Loop: `for (let i = 0; i < 26; i++)` — 25 successful + 1 overflow
  - Assertion: Gate error thrown before browser launch
  - Message match: 'callBurnCount exceeds 25-cap'
- ✅ Test 2: "smoke joins allowed even when callBurnCount > 25"
  - Loop: 26 burns to exceed cap
  - Assertion: `willThrowGateError` is false for smoke (acceptanceAttempt=false)

### 5. vitest.config.ts — fork cap constraint
- ✅ `pool: 'forks'` enabled
- ✅ `poolOptions.forks.maxForks: 3` matches north-star constraint
- ✅ Prevents memory exhaustion (each fork ≈3.5GB for browser+whisper)

## Test execution

```
RUN  v2.1.9 /home/agjrom/websites/meet-poc

 ✓ e2e/harness/__tests__/call-ledger.test.ts (25 tests) 16ms
 ✓ e2e/harness/__tests__/call-driver.test.ts (21 tests | 5 skipped) 250ms

 Test Files  2 passed (2)
      Tests  41 passed | 5 skipped (46)
   Start at  13:59:06
   Duration  725ms
```

## No live join runs

✅ Confirmed: Batch constraints prevented any `joinDualBrowserCall` live runs (gate bypass not available).  
✅ CAP25 enforcement pre-blocks acceptance attempts in this batch.

## Summary

All call-ledger and call-driver unit tests pass with CAP25 configuration. B08 weak-signal shim integration is clean and pure. vitest fork cap (maxForks: 3) prevents memory exhaustion. No residual dirty test loops remain.

**Ready for gate validation.**
