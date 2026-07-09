# Red-team back-gate — B01 (budget tier)

You are agj-panelist (READ-ONLY). Verifier ≠ fixer — do NOT write the fix.

## Diff under review
Commit eada423 on branch batch-01-diagnosis-2026-07-08:
- e2e/harness/call-ledger.ts
- e2e/harness/__tests__/call-ledger.test.ts
Also read: plan/.../validation/b01-changes.md and plan.md B01 acceptance.

## B01 acceptance that must not be breakable
1. Protected IDs never deletable: session 652c1475, rooms TEST_ROOM01, testroom01001 — even if registered
2. Uncaptured IDs cannot be deleted
3. Registered non-protected IDs can be deleted
4. Call burn cap 25; gate cap 5
5. No wildcard sweeps; only harness-created IDs

## Lens (budget adversarial)
Find ways this fails open: path traversal on state file, case-normalization bypass, partial ID match, concurrent races, empty-id registration, resetLedger misuse, env LEDGER_STATE_DIR pointing at wrong tree, canDelete returning true for protected under edge cases.

## Output
Verdict: CLEAN or FINDINGS
List concrete findings with file:line if any.
End with: [projcore callback] redteam B01 STATUS: DONE — CLEAN|FINDINGS

Do not implement fixes.
