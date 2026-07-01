## Accepted: Batch-B1 — STATUS: PASS
HEAD: 6643a02 (fix/sfu-selfheal-20260701)
Branch: fix/sfu-selfheal-20260701
Implemented: Env-gated backend 406 fault injection (SFU_FAULT_INJECT, null in prod) + honest BUG-REPRO
tests reproducing the current give-up: subscribe-cap latch (advertised-not-subscribed), mark-stalled
terminal, epoch-guard contract (inert pure predicate), 406 evidence separate from lastGumError.
Req#s closed: R1 (VERIFIED).
Open in matrix: R2 (B2), R3 (B3), R4 (B4), R5 (B5), R6 (B6-B9).
Environment/migration gotchas:
- Frontend node:assert specs run via `npx tsx <spec>.ts`; backend via `npx vitest run tests/<f>`.
  NOT in root `npm test` (which is backend-only) — these frontend specs are silent in CI.
- Pre-existing unrelated failure: room-decisions.spec.ts L400 missingPreflightPrereqs (out of scope).
Validation lessons:
- Validator callback hit 403 manifest-scope (batch-id mismatch). For B2+: wait on the validator's
  independent-validation.md artifact + pane STATUS, not callbacks.md.
- grok hidden-fix audit is essential and PASSED here (recovery logic untouched).

## Ready for Batch-B2 (the fix)
Approach LOCKED by B0 consensus (deliberation/B0-recovery-ladder/consensus.md): 4-rung escalation
ladder (same-session retry → forced renegotiated subscribe → coalesced fresh-cfSessionId full local
rejoin → visible unrecovered UI) in ONE recovery coordinator keyed by {epoch, publisher}, epoch guard
against stale in-flight binds. B2 owns the coordinator. Reuse the inert sfu-recovery-epoch.ts predicate
+ the lastSubscribeFailureEvidence instrumentation from B1. [REDTEAM:elite] back-gate. complexity high.
Routing: Sonnet implementer (§1.14 correctness-critical rung) — see decisions/2026-07-01-b2-routing.md.
