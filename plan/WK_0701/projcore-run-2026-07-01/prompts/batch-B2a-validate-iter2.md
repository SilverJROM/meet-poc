<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B2a RE-VALIDATION (iter 2): confirm the mid-call give-up is closed + sweep for others

Role: independent validator (codex55). You previously returned REPRO-STILL-PRESENT on B2a because the
mid-call subscribe path (scheduleMidCallSubscribeRetry) still permanently stopped. The implementer (Sonnet)
applied a correction. Changes are UNCOMMITTED on branch fix/sfu-selfheal-20260701 (`git diff`).

Batch ID: batch-B2a
Requirement R2 (partial — same-session escalation; rung-3 rejoin is B2b).

## Your re-audit (focused)
1. **Mid-call gap closed:** Confirm `scheduleMidCallSubscribeRetry` cap-exhaust (~sfu-client.service.ts:1500-1517)
   NO LONGER terminally stops — it now emits `needs-rejoin` + calls `armSubscribeRecoveryLowFrequencyRetry`
   (guarded by canRunSubscribeRecovery). Verify the never-give-up invariant now holds for the mid-call path.
2. **Sweep for ANY OTHER terminal give-up:** Scan the whole service for remaining permanent-stop paths while
   admitted+advertised. In particular check the **live-mid-conflict renegotiation retry** path
   (~line 525 calls nextSubscribeRetry; line ~416 logs "subscribe permanently stopped ... guard stays set
   until cfSessionId changes"). Decide: is that a REAL never-give-up violation (a user left permanently
   unheard while admitted+advertising), or an acceptable "await fresh publisher state" that self-clears on
   the next sfu-publish? If it can leave a user permanently unheard with no self-clear → REPRO-STILL-PRESENT
   with the exact path. If it self-clears on fresh state (roster/cfSession change) → note it as acceptable
   for B2a (B2b rejoin will coalesce it anyway).
3. **Tests honest + TERMINATE:** run each under a timeout so a hang is a fast fail:
   - `cd frontend && timeout 25 npx tsx src/app/services/sfu-recovery-coordinator.spec.ts`
   - `cd frontend && timeout 25 npx tsx src/app/services/sfu-repro-harness.spec.ts`
   - `cd frontend && timeout 40 npx tsx src/app/services/sfu-client.spec.ts`
   Confirm the mid-call escalation assertion (moved to the fake-timed coordinator spec) genuinely asserts the
   OUTCOME (cap-exhaust → needs-rejoin + low-freq armed + fake tick re-fires), and the obsolete terminal-stop
   assertion in sfu-client.spec.ts is gone. Confirm NO production test-mode hack was added (no unref/NODE_ENV).
4. **Epoch guard + no ghost streams** — unchanged from your prior PASS; spot-confirm still intact.

## Output
Update `plan/WK_0701/projcore-run-2026-07-01/batch-B2a/independent-validation.md` (append an "## Iter 2
re-validation" section). Verdict.

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
Emit **REPRO-CLEARED-ON-LOCAL** if the mid-call gap is closed + no other real terminal give-up + tests honest;
**REPRO-STILL-PRESENT** if a real terminal give-up remains (name the path).

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+validator[[:space:]]+batch-B2a[[:space:]]+RECEIVED[[:space:]]+REPRO-CLEARED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: WORKING
