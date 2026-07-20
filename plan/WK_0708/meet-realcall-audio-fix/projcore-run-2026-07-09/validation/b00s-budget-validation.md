# B00S-BUDGET Independent Validation

**Commits:** `d33eb22` (mechanism) + `1fdc6c0` (cap 50 + burn reconcile 49)  
**Validator:** projcore (active gate; unit-only batch — no UI surface)  
**Date:** 2026-07-09T12:22Z  
**Verdict:** **PASS / VERIFIED**

## Q0 / Evidence class

Structural harness batch (ledger + call-driver), not user-visible UI. Acceptance = unit tests + code audit of burn policy. Live dual-browser not required for this batch.

## Independent re-run

```text
cd e2e && npx vitest run harness/__tests__/call-ledger.test.ts harness/__tests__/call-driver.test.ts
✓ call-ledger 25 tests
✓ call-driver 21 tests | 5 skipped
Test Files  2 passed
Tests  41 passed | 5 skipped
Duration ~638ms
```

## Gate checklist (structural plan)

| # | Criterion | Evidence | Result |
|---|---|---|---|
| 1 | Burn only acceptance + ≥180s (or forceBurn) | `incrementCallBurn` shouldBurn = acceptance && (dur≥180k \|\| forceBurn) | PASS |
| 2 | logCall every join | success + catch paths call `logCall` | PASS |
| 3 | Single ledger path | init prefers LEDGER_STATE_DIR / basePath; reconcile to repo-root | PASS (e2e file relic ok) |
| 4 | Fail-closed acceptance when over cap | `acceptanceAttempt && isCallBurnExceeded()` throws pre-launch | PASS |
| 5 | Cap = **50** (JROM) | `DEFAULT_CALL_BURN_CAP = 50`; error "50-cap" | PASS |
| 6 | Burn count = **49** (JROM) | root `ledger-state.json` callBurnCount=49; call-log reconcile entry | PASS |
| 7 | No silent zero of history | from 58→49 via JROM reconcile, createdIDs kept | PASS |
| 8 | Unit tests green | 41 passed | PASS |

## Remaining headroom

- Cap 50, count 49 → **~1 acceptance burn** before fail-closed (`count > 50`).
- **AC1/B08 strategy:** use `acceptanceAttempt: false` (or short <180s) for baseline sweep points; reserve acceptance burns for true AC gates (B11).

## Nits (non-blocking)

- Comment still says "25-cap" / "1/25" in `call-driver.ts` lines ~46, ~530 — cosmetic only.

## Verdict

**VERIFIED** on `1fdc6c0` (+ parent `d33eb22`). Queue → AC1 path starts at **B08**.
