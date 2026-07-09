# B01 Re-Validation — Fail-Open Fixes

**Validator:** L2 codex55  
**Branch:** `batch-01-diagnosis-2026-07-08`  
**Commit checked:** `b0f2bcee41723bd68dee3cb1b464693341299f44`  
**Scope:** Re-check only B01 fail-open fixes from prior validator FAIL:

1. Empty ID `registerCreatedID()` / `canDelete()`
2. Whitespace-only ID `registerCreatedID()` / `canDelete()`
3. `getState()` mutable `createdIDs` bypass

**Verdict:** FAIL

## Required Suite Reproduction

Command:

```bash
npx tsx e2e/harness/__tests__/call-ledger.test.ts
```

Result:

- PASS: 18
- FAIL: 0
- Exit code: 0

The required suite now includes the three fix-regression cases and passes:

- Empty ID registration does not authorize deletion.
- Whitespace-only ID registration does not authorize deletion.
- `getState().createdIDs.push(...)` does not authorize deletion.

## Adversarial Checks

Command:

```bash
npx tsx -e "<independent fail-open adversarial checks>"
```

Result:

- PASS: 6
- FAIL: 1
- Exit code: 1

Passing checks:

- Empty ID remains unauthorized after `registerCreatedID('room', '')`.
- Whitespace-only ID remains unauthorized after `registerCreatedID('room', '   ')`.
- Tab/newline whitespace remains unauthorized after `registerCreatedID('session', '\t\n  ')`.
- Protected IDs remain unauthorized even after registration.
- `getState().createdIDs.push({ ... })` no longer authorizes an uncaptured ID.
- Registered non-protected ID remains authorized.

Failing check:

| Check | Expected | Actual | Impact |
|---|---:|---:|---|
| Register `legit-room`; call `const state = getState()`; mutate `state.createdIDs[0].id = 'object-mutated-uncaptured'`; then call `canDelete('object-mutated-uncaptured')` | `false` | `true` | `getState()` returns a copied array but still exposes live `LedgerEntry` object references, so caller-side mutation can authorize an uncaptured ID without `registerCreatedID()`. |

## Mechanism Review

The empty and whitespace fail-open fixes are closed at [e2e/harness/call-ledger.ts](/home/agjrom/websites/meet-poc/e2e/harness/call-ledger.ts:62) and [e2e/harness/call-ledger.ts](/home/agjrom/websites/meet-poc/e2e/harness/call-ledger.ts:75): both `registerCreatedID()` and `canDelete()` reject empty or trim-empty strings.

The prior array-push bypass is only partially closed at [e2e/harness/call-ledger.ts](/home/agjrom/websites/meet-poc/e2e/harness/call-ledger.ts:110). `getState()` returns `createdIDs: [...currentState.createdIDs]`, which copies the array shell but not the entry objects. Because `canDelete()` trusts `currentState.createdIDs.some((entry) => entry.id === id)` at [e2e/harness/call-ledger.ts](/home/agjrom/websites/meet-poc/e2e/harness/call-ledger.ts:87), mutating a returned entry object mutates the live authorization source.

## Acceptance Mapping

| B01 fail-open recheck | Evidence | Result |
|---|---|---|
| Empty ID registration/delete fail closed | Required suite + adversarial check | PASS |
| Whitespace-only ID registration/delete fail closed | Required suite + adversarial check, including tab/newline whitespace | PASS |
| `getState()` mutable `createdIDs` bypass fail closed | Required suite covers array push only; adversarial object-property mutation still authorizes uncaptured ID | FAIL |

## Q0

A fresh user of the harness would agree the original empty/whitespace issues are fixed and the exact `createdIDs.push()` bypass is blocked. They would not agree the `getState()` mutable-state bypass is fully fixed, because returned ledger entries are still live mutable objects that can change the internal authorization list.

## Callback

[projcore callback] validator B01 STATUS: DONE — FAIL
