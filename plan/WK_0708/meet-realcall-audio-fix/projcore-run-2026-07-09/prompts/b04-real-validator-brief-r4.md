# B04-real Validator Brief R4 — STT Fail-Closed Logic

**Your first tool call in every reply MUST be the `callbacks.md` append … BEFORE any prose tokens stream.**

---

## Summary

Validate the fail-closed STT corroboration fix (commit 7bee2f6). The fix makes sttData REQUIRED (not optional) on detectDropouts() and analyzeCall(), changing the logic from `!sttData || hasExpectedWordsInSTT()` to just `hasExpectedWordsInSTT()`. This ensures silence-only without STT corroboration is NEVER marked as dropout (D27 binding).

## What was fixed (commit 7bee2f6)

**File: e2e/harness/dropout-analyzer.ts**
1. Made `sttData` required (not optional `?`) on detectDropouts() parameter
2. Made `sttData` required (not optional `?`) on analyzeCall() parameter  
3. Removed the `!sttData ||` short-circuit from the dropout detection logic (line 90)
4. Changed from: `const isDropout = !sttData || hasExpectedWordsInSTT(...)`
5. Changed to: `const isDropout = hasExpectedWordsInSTT(...)`

## Validation task

**D27 binding requirement:** Dropout = silence (no voiced energy at far end) + missing STT words. Never silence alone without STT corroboration.

1. **Re-run B04 test:** `npm test -w e2e -- --include="**/b04*"` or `cd e2e && npx vitest run harness/__tests__/b04-real-tgap-derivation.browser.test.ts`
   - Should PASS all 3 tests (call 1, call 2, merge+derive)
   - Verify T_gap.md is re-derived with the corrected fail-closed logic
   - Check that decisions/T_gap.md contains:
     - Measured T_gap value
     - Call 1: X dropouts with Y words recognized
     - Call 2: Z dropouts with W words recognized
     - Distribution statistics (min/median/mean/p95/p99/max)

2. **Verify the fix is correct:**
   - With STT corroboration now REQUIRED, only real dropouts (silence + missing words) are counted
   - No silence-only dropouts falsely inflating the distribution
   - T_gap should be reasonable (check that the logic now properly gates dropout detection to STT-backed gaps only)

3. **Code check:**
   - Confirm sttData parameter is no longer optional in both functions
   - Confirm the analyzer now fails fast if STT is missing (do NOT fall back to energy-only)
   - No synthetic dropouts from energy alone

## Acceptance criteria

- ✅ All 3 B04 tests pass (call 1, call 2, merge)
- ✅ decisions/T_gap.md is regenerated with real data (not scaffolded)
- ✅ T_gap value is derived from real dropout distribution + 25% safety margin
- ✅ STT corroboration is evident in the evidence section (words recognized per call)
- ✅ No synthetic/energy-only dropouts inflating the distribution

## Questions?

Check `plan/.../decisions/T_gap_provisional.md` for the binding rules, or ask me via 3-call tmux if unclear.

---

**Verdict format:** STATUS: DONE — PASS (commit hash, brief summary) or STATUS: DONE — FAIL (which checks failed, what's broken).
