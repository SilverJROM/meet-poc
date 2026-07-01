<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B4 VALIDATION + standard red-team: publish/PC-failure recovery (R4, the Glory case)

Role: independent validator + [REDTEAM:standard] (codex55). Audit correctness + try to break it. Implementer
Sonnet. Changes UNCOMMITTED on fix/sfu-selfheal-20260701 (`git diff` — sfu-client.service.ts, room.page.ts/.html,
sfu-client.spec.ts, sfu-recovery-coordinator.spec.ts, new e2e/tests/sfu-b4-publish-recovery/).

Batch ID: batch-B4 · Requirement R4.

## Audit / attack
1. **R4a detect media-not-published:** confirm detection of hasPc:false / localPublishState null|'error'
   post-join, distinguished from 'published' and 'publishing'.
2. **R4b auto-recover, no manual leave:** escalatePublishFailure() → executeThrottledFullRejoin('publish')
   (the extracted rung-3 executor). Confirm the capped-transport branch (handleTransportStateChange 'capped',
   previously a dead-end) now escalates into publish recovery. Bounded/throttled (shares ≤1/15s ≤2/2min).
3. **R4c unrecoverable → explicit UI:** publishRecoveryFailed signal → room.page.ts host-AGNOSTIC notice +
   Rejoin button (rejoinAfterInitialPublishFailure). Verify the e2e screenshot
   (batch-B4/screenshots/) shows the actual notice, not a blank/login page.
## RED-TEAM lenses (try to BREAK):
- **CLOBBER (critical):** can escalatePublishFailure ever fire against a HEALTHY ('published') or in-progress
  ('publishing') publish and rotate/disrupt a working call? Trace every caller. The guard is
  isLocalPublishHealthy()→no-op + 'publishing'→no-op — find any bypass.
- **B2a/B2b regression:** the plan EXTRACTED runFullSfuRejoin's body into executeThrottledFullRejoin. Confirm
  runFullSfuRejoin behavior is unchanged (rung-3 still guards status==='published', throttle intact). Run the
  coordinator spec.
- **Stuck banner:** can publishRecoveryFailed get stuck true after a later successful publish, or flip true
  while a legit retry is still in progress?
- **Publish storm:** can repeated triggers / the capped branch / retry-exhaustion produce a publish/rejoin storm?

## Tests (run under timeout)
- `cd frontend && timeout 45 npx tsx src/app/services/sfu-recovery-coordinator.spec.ts` (B2a/B2b/B3/B4 — must pass)
- `cd frontend && timeout 45 npx tsx src/app/services/sfu-client.spec.ts`
Confirm the new B4 tests assert OUTCOMES (guard no-ops on healthy, escalate on unhealthy, banner set/reset,
capped-branch wiring), not just call presence.

## Output
Write verdict to `plan/WK_0701/projcore-run-2026-07-01/batch-B4/independent-validation.md`. Per criterion + red-team lens.

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). The first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh validator batch-B4 <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states: WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO
NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```
Emit **REPRO-CLEARED-ON-LOCAL** if R4a/b/c hold + no clobber + no regression + tests honest + UI proof real;
**REPRO-STILL-PRESENT** if a real defect remains (name it).

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+validator[[:space:]]+batch-B4[[:space:]]+RECEIVED[[:space:]]+REPRO-CLEARED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: WORKING
