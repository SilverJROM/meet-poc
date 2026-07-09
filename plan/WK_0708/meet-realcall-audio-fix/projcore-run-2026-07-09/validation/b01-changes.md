# B01 Changes — Call-Budget Ledger and Cleanup Guardrails

**Batch ID:** B01  
**Status:** DONE  
**Test Result:** 15/15 passed

## Summary

Added a run-owned harness-state ledger module (`e2e/harness/call-ledger.ts`) that prevents resource leak by:
- Tracking created IDs (rooms/sessions) at instantiation time
- Enforcing call budget cap (25 real calls max)
- Enforcing gate check cap (5 gates max)
- Guarding deletes: only IDs registered in this run can be deleted
- Hard-blocking protected IDs (session `652c1475`, rooms `TEST_ROOM01`/`testroom01001`)

## Files Added

### `e2e/harness/call-ledger.ts`
Main ledger module. Exports:
- `initLedger(basePath?)` — initialize ledger (reads from LEDGER_STATE_DIR or cwd)
- `registerCreatedID(type, id)` — register room/session ID at creation
- `canDelete(id)` — return true only if ID is non-protected AND registered by this run
- `incrementCallBurn()` / `isCallBurnExceeded()` — 25-call budget enforcement
- `incrementGateCheck()` / `isGateCheckExceeded()` — 5-gate cap enforcement
- `getState()` — snapshot current ledger state
- `resetLedger()` — clear ledger (test/reset use)

Protected IDs hard-coded and unchallengeable: `652c1475`, `TEST_ROOM01`, `testroom01001`.

State persists to `ledger-state.json` per run.

### `e2e/harness/__tests__/call-ledger.test.ts`
Unit test suite (15 scenarios, all passing):

**Protect blocking (3 tests)**
- Protected session `652c1475` always blocks delete
- Protected rooms `TEST_ROOM01`, `testroom01001` always block delete
- Protection holds even if accidentally registered

**Uncaptured rejection (2 tests)**
- Unregistered IDs cannot be deleted
- Multiple registered IDs tracked correctly

**Registered allow path (3 tests)**
- Registered room IDs can be deleted
- Registered session IDs (non-protected) can be deleted
- Multiple registrations tracked

**Budget enforcement (2 tests)**
- Call burn increments allowed up to 25, return true
- 26th call rejected (false), `isCallBurnExceeded()` true

**Gate cap enforcement (2 tests)**
- Gate check increments allowed up to 5, return true
- 6th gate rejected (false), `isGateCheckExceeded()` true

**Persistence (2 tests)**
- Created IDs written to `ledger-state.json`
- Call burn count persisted

**State retrieval (1 test)**
- `getState()` returns snapshot with all counters

## Acceptance Criteria (B01)

- ✓ Dry-run proves protected IDs cannot be deleted (protect blocking tests 1–3)
- ✓ Dry-run proves uncaptured IDs are rejected (uncaptured rejection tests 1–2)
- ✓ Unit tests cover protect block, uncaptured reject, allow registered (all 15 scenarios)

## Integration Notes

Module is located under `e2e/harness/` for reuse by later Playwright/orchestrator batches. Later batches can import and call `registerCreatedID()` at room/session creation, and `canDelete()` before deletion operations. Budget tracking is optional per batch.

## No Open Questions

Scope is atomic and complete. Ready for validator gate.
