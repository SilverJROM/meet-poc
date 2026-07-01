<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B2a RE-VALIDATION (iter 3, final): confirm the never-give-up class is fully closed

Role: independent validator (codex55). Your iter-1 flagged mid-call (fixed), iter-2 flagged the
live-mid-conflict fallback (now fixed). Implementer (Sonnet) applied a comprehensive iter-2 fix + an
exhaustive grep. Confirm the class is closed. Changes UNCOMMITTED on fix/sfu-selfheal-20260701 (`git diff`).

Batch ID: batch-B2a · Requirement R2 (partial — same-session escalation; rung-3 rejoin is B2b).

## Your final audit
1. **Live-mid-conflict fallback (iter-2 gap) CLOSED:** confirm at ~sfu-client.service.ts:532, on
   `nextSubscribeRetry` !shouldRetry/capped, the code now deletes the guard + emits needs-rejoin + arms
   low-freq (guarded by canRunSubscribeRecovery) instead of a bare return latch.
2. **Verify the exhaustive-grep table in batch-B2a/changes.md is ACCURATE.** The implementer claims every
   capped/!shouldRetry subscribe decision is either correct-by-construction or fixed, and that the
   transport-recovery cap (~L805, handleTransportStateChange 'capped') is R4/B4 publish-recovery scope (NOT
   an R2 subscribe give-up). Independently confirm: (a) `grep -n "nextSubscribeRetry("` shows exactly def +
   one caller; (b) `scheduleLiveMidConflictRenegotiationRetry`'s own cap now arms low-freq for BOTH sources;
   (c) the L805 transport cap is genuinely publish/PC (R4), not a subscribe give-up. If the table is honest
   and no subscribe-path terminal give-up remains while admitted+advertising → CLEARED.
3. **Tests honest + terminate:** run under timeout —
   `cd frontend && for t in sfu-recovery-coordinator sfu-repro-harness sfu-recovery-epoch; do timeout 30 npx tsx src/app/services/$t.spec.ts; done`
   and `timeout 45 npx tsx src/app/services/sfu-client.spec.ts`. Confirm the live-mid-conflict escalation has
   a fake-timed outcome assertion.
4. Epoch guard + no ghost streams: unchanged — spot-confirm.

## Output
Append "## Iter 3 re-validation (final)" to batch-B2a/independent-validation.md. Verdict.

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). The first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh validator batch-B2a <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states: WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO
NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```
Emit **REPRO-CLEARED-ON-LOCAL** if the subscribe-path never-give-up class is fully closed + tests honest;
**REPRO-STILL-PRESENT** only if a REAL subscribe-path terminal give-up remains (name it precisely).

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+validator[[:space:]]+batch-B2a[[:space:]]+RECEIVED[[:space:]]+REPRO-CLEARED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: WORKING
