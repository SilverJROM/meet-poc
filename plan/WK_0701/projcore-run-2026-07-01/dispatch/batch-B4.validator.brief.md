<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B4 RE-VALIDATION (iter 2): confirm R4b auto-recovery gap closed

Role: independent validator (codex55). Your iter-1 found R4b FAIL (terminal initial-publish exits skipped
escalatePublishFailure). Fix applied. Changes UNCOMMITTED on fix/sfu-selfheal-20260701.
Batch ID: batch-B4 · Requirement R4.

## Confirm
1. Both terminal exits now auto-recover: transceiver-check (room.page.ts ~1811-1812) and retry-cap
   (~1848-1849) call markPublishAttemptFailed(...) THEN escalatePublishFailure() — R4b now met without manual leave.
2. markPublishAttemptFailed() (new, sfu-client.service.ts ~476) sets localPublishState to 'error' so
   escalatePublishFailure's isLocalPublishHealthy() guard doesn't read stale 'published' and no-op. Confirm it
   does NOT clobber a genuinely healthy/publishing publish (only corrects a stale-after-failure state).
3. No regression: `cd frontend && timeout 45 npx tsx src/app/services/sfu-recovery-coordinator.spec.ts` and
   `timeout 45 npx tsx src/app/services/sfu-client.spec.ts` pass. The 2 new tests assert the terminal exits
   trigger escalatePublishFailure (outcome, not call-presence).
4. Everything you previously PASSED (clobber guard, B2a/B2b regression, stuck-banner, storm, capped branch,
   R4c UI) is intact.

## Output
Append "## Iter 2 re-validation" to batch-B4/independent-validation.md. Verdict.

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
Emit **REPRO-CLEARED-ON-LOCAL** if R4b now met + no new clobber/regression; **REPRO-STILL-PRESENT** if a real defect remains.

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+validator[[:space:]]+batch-B4[[:space:]]+RECEIVED[[:space:]]+REPRO-CLEARED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: WORKING
