# B01 Validation Recheck

Commit: `22db4f4`
Date: 2026-07-09

## Verdict PASS

Re-validation target was limited to B01 commit `22db4f4` and the prior FAIL condition: `getState()` returning shallow `LedgerEntry` object references.

## Evidence

Implementation check:

- `getState()` now returns `createdIDs: currentState.createdIDs.map((e) => ({ ...e }))`, so callers receive copied entry objects rather than live ledger entry references.

Required harness command:

```bash
npx tsx e2e/harness/__tests__/call-ledger.test.ts
```

Result:

```text
Passed: 19
Failed: 0
Total: 19 tests
```

Required adversarial deep-copy check:

1. Registered original ID: `legit-room-deepcopy`
2. Retrieved `const state = getState()`
3. Mutated returned entry: `state.createdIDs[0].id = 'mutated-room-deepcopy'`
4. Verified `canDelete('mutated-room-deepcopy') === false`
5. Verified `canDelete('legit-room-deepcopy') === true`

Observed output:

```json
{"mutatedCanDelete":false,"origCanDelete":true,"entries":1}
```

The prior shallow object mutation bypass is closed in `22db4f4`.
