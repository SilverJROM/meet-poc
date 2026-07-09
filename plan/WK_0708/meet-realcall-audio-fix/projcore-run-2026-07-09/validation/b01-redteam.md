# B01 Red-Team Review: call-ledger Implementation

**Commit**: eada423  
**Files**: `e2e/harness/call-ledger.ts`, `e2e/harness/__tests__/call-ledger.test.ts`  
**Date**: 2026-07-09

---

## Threat Model Coverage

### 1. Protected IDs (652c1475/TEST_ROOM01/testroom01001) Never Deletable

✅ **PASS**

- **Implementation** (line 19-23): Hardcoded `PROTECTED_IDS` Set with three exact IDs
- **Enforcement** (line 71-75): `canDelete()` checks membership BEFORE allowing deletion
- **Test coverage**: Lines 58-91 verify all three protected IDs block deletion, even when registered
- **Order-of-checks correct**: Protected check happens first; registration check never overrides it

### 2. Uncaptured Reject (Unregistered IDs Must Be Rejected)

✅ **PASS**

- **Implementation** (line 78): `canDelete()` only returns true if ID exists in `currentState.createdIDs`
- **Default behavior**: `some()` on empty or non-matching list returns false
- **Test coverage** (lines 94-121):
  - Unregistered ID explicitly rejected
  - Only registered IDs allowed
  - Distinction between registered room and unregistered session validated

### 3. Registered Allow (Registered Non-Protected IDs Deletable)

✅ **PASS**

- **Implementation** (line 62-69): `registerCreatedID()` persists to ledger
- **Allow logic** (line 78): Returns true for any registered ID not in PROTECTED_IDS
- **Test coverage** (lines 124-158): Multiple registrations, multiple ID types (room/session), tracked correctly

### 4. Call Budget Cap (25 calls)

✅ **PASS**

- **Constant**: Defined line 25 as `const` (immutable)
- **Increment semantics** (line 81-85): Counter incremented FIRST, then comparison returns `≤ cap` result
- **25th call** returns true (25 ≤ 25)
- **26th call** increments to 26, returns false (26 ≤ 25 = false), but counter IS incremented
- **Excess detection** (line 87-89): `isCallBurnExceeded()` correctly returns true when count > 25
- **Test coverage** (lines 161-188): Validates both at-cap and beyond-cap behavior

### 5. Gate Budget Cap (5 gates)

✅ **PASS**

- **Constant**: Defined line 26 as `const` (immutable)
- **Same semantics as call budget** (lines 91-99)
- **5th gate** returns true, 6th returns false
- **Test coverage** (lines 191-217): Parallel validation to call budget tests

---

## Fail-Open Edge Hunt

### Edge A: Typo in Protected ID
**Scenario**: Attacker tries `canDelete('652c147')` (missing digit)
- PROTECTED_IDS.has('652c147') → false
- createdIDs.some(...) → false (exact match required)
- Result: false ✓ (safely rejected)

### Edge B: Protected ID Also Registered
**Scenario**: `registerCreatedID('session', '652c1475')` then `canDelete('652c1475')`
- Line 73 check fires FIRST, returns false before reaching line 78
- Result: false ✓ (protected check overrides)
- **Test validation** (lines 80-91)

### Edge C: Uninitialized Ledger Path
**Scenario**: Call `registerCreatedID()` without `initLedger()`
- `ledgerPath` stays null (line 28)
- `saveState()` called, but guard on line 58 catches null, returns early
- In-memory state updated but NOT persisted
- **On process restart**: fresh initialization loads empty disk state
- Result: false for previously "registered" ID ✓ (no persistence = not really registered)
- **Not a fail-open**: Soft contract violation, not security bypass

### Edge D: State File Corruption
**Scenario**: Corrupt JSON in ledger-state.json
- `loadState()` line 48 catches parse error, resets to fresh state (lines 49-53)
- Result: false for unregistered IDs ✓ (safe fallback)

### Edge E: Budget Soft Boundary
**Scenario**: Caller ignores return value of `incrementCallBurn()`, keeps calling
- Counter IS incremented on 26th call
- Return value is false but not enforced
- **Result**: Soft budget, not hard block
- **Assessment**: Not a fail-open—caller must check return value; design is intentional per tests
- Verification: Test line 182 shows 26th call increments counter AND returns false (soft budget by design)

### Edge F: Bypass via Set.add() at Runtime
**Scenario**: Attacker adds unauthorized ID to PROTECTED_IDS via reflection
- PROTECTED_IDS not exported; internal to module
- JavaScript Set.add() possible only with direct reference
- **Result**: Not a practical fail-open for this harness context (would require code injection first)

### Edge G: State File Poisoning
**Scenario**: Attacker manually edits ledger-state.json with false data
- `loadState()` parses whatever is in the file
- **Result**: Budget counters could be pre-inflated, but canDelete() logic unaffected
- **Assessment**: Assumes file trustworthiness; orthogonal to ledger logic integrity

---

## Verdict

✅ **PASS-CLEAN**

All hard-blocking policies (protected IDs, uncaptured rejection, registered allow, budget caps) function correctly with no fail-open edges. Budget mechanism is soft-advisory by design (returns false post-cap but caller must respect it). All critical paths tested; state persistence sound with error recovery.

---

## [projcore callback] redteam B01 STATUS: DONE — CLEAN
