# B01 Validation — Call-Budget Ledger and Cleanup Guardrails

**Validator:** L2 codex55  
**Branch:** `batch-01-diagnosis-2026-07-08`  
**Commit checked:** `eada423`  
**Verdict:** FAIL

## Evidence

### Required unit reproduction

Command:

```bash
npx tsx e2e/harness/__tests__/call-ledger.test.ts
```

Result:

- PASS: 15
- FAIL: 0
- Required suite confirms protected IDs are blocked, uncaptured IDs are rejected, registered non-protected IDs are allowed, budget cap is 25, gate cap is 5, and state persistence exists.

### Adversarial dry-run checks

Command:

```bash
npx tsx -e "<independent call-ledger adversarial checks>"
```

Passing checks:

- Protected session `652c1475` remains blocked even after registration.
- Protected rooms `TEST_ROOM01` and `testroom01001` remain blocked even after registration.
- Unregistered empty string, whitespace, and partial protected IDs are rejected.
- Registered non-protected room ID is allowed.
- Call budget reaches 25 and the 26th call returns false.
- Gate budget reaches 5 and the 6th gate returns false.
- `ledger-state.json` is written under the provided state path.

Fail-open checks:

| Check | Expected | Actual | Impact |
|---|---:|---:|---|
| `registerCreatedID('room', '')`; `canDelete('')` | `false` | `true` | Empty IDs can become cleanup-authorized. |
| `registerCreatedID('room', '   ')`; `canDelete('   ')` | `false` | `true` | Whitespace-only IDs can become cleanup-authorized. |
| `getState().createdIDs.push({ type: 'room', id: 'mutated-not-registered', timestamp: 0 })`; `canDelete('mutated-not-registered')` | `false` | `true` | The exported state "snapshot" shares the live `createdIDs` array, allowing delete authorization without `registerCreatedID()`. |

## Acceptance Mapping

| B01 acceptance | Evidence | Result |
|---|---|---|
| Dry-run proves protected IDs cannot be deleted: `652c1475`, `TEST_ROOM01`, `testroom01001` | Required suite + adversarial registered-protected checks | PASS |
| Uncaptured IDs rejected for delete | Required suite passes, but `getState()` mutable array allows an uncaptured ID to be inserted into live state and then deleted | FAIL |
| Registered non-protected IDs allowed | Required suite + adversarial registered room check | PASS |
| Call budget 25 + gate 5 tracking exists | Required suite + adversarial cap checks | PASS |
| No AC closes yet — safety prerequisite only | No AC closure attempted | PASS |

## Q0

A fresh user of the harness would agree the happy-path delete guard exists, but not that it is fail-closed. The guard trusts any registered string, including empty/whitespace IDs, and `getState()` exposes a mutable reference that can authorize an uncaptured ID without going through the registry API. Since B01 is the cleanup safety prerequisite and the validator brief says to fail closed, this does not pass.

## Callback

[projcore callback] validator B01 STATUS: DONE — FAIL — required tests pass, but adversarial guard checks found empty/whitespace ID authorization and mutable state bypass.
