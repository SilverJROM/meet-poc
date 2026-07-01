# Decision — Dedicated sfu-repro-harness.spec.ts (batch-B1)

**Date:** 2026-07-01  
**Batch:** B1  
**Status:** Approved at PROPOSED

## Decision

Add `frontend/src/app/services/sfu-repro-harness.spec.ts` instead of extending `sfu-client.spec.ts` for BUG-REPRO-R1 tests.

## Why

- `sfu-client.spec.ts` has a known pre-existing tsx harness failure; B1 required-green set must stay isolated.
- Repro tests need long fake-timer drive loops and polled outcome assertions — keeping them separate preserves readability and validator auditability.
- B2 will flip BUG-REPRO tests in one file without touching unrelated SFU regression coverage.