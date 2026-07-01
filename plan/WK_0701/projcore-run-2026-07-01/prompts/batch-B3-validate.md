<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B3 VALIDATION + standard red-team: stalled remote-audio detection (R3)

Role: independent validator + [REDTEAM:standard] (codex55). Audit correctness + try to break it. Implementer
Sonnet. Changes UNCOMMITTED on fix/sfu-selfheal-20260701 (`git diff` — room-decisions.ts, room.page.ts,
sfu-client.service.ts, room-decisions.spec.ts, sfu-recovery-coordinator.spec.ts).

Batch ID: batch-B3 · Requirement R3.

## Audit / attack (the 3 acceptance criteria + red-team lenses)
1. **R3a healthy-silence vs broken:** confirm `publisherMicEnabled === false` (mic off) → clears/holds, NEVER
   escalates (a peer who is just silent must not trigger churn). Confirm emitted-samples/energy ADVANCED →
   clears attempts. RED-TEAM: find any mic-off/healthy-silence case that wrongly escalates.
2. **R3b broken → recovery:** mic on/unknown + bytes-flat → `escalate-recovery`; bytes-arrive-but-no-progress
   → playout recovery first, then on window-exhaust → `escalate-recovery` (NOT terminal mark-stalled). Confirm
   escalateStalledRemoteAudio → scheduleRecoveryEscalation (the B2a coordinator, no new loop).
3. **R3c per-publisher, no clobber:** confirm a stalled Alice's recovery does NOT touch a healthy Bob.
   RED-TEAM: find any path where B3 recovery for one publisher disrupts another's healthy stream.
4. Confirm `mark-stalled` is FULLY removed (no dangling references) and every old consumer updated.
5. Confirm attempts reset when real audio resumes (note-emission-advanced path).

## Tests (run under timeout; note the pre-existing failure)
- `cd frontend && timeout 40 npx tsx src/app/services/sfu-recovery-coordinator.spec.ts` (should pass clean).
- `cd frontend && timeout 30 npx tsx src/app/pages/room/room-decisions.spec.ts` — this EXITS 1 due to a
  PRE-EXISTING, out-of-scope failure at ~L434 (missingPreflightPrereqs expects ['mic','speaker'], gets ['mic'];
  present at base e9aedff, logged to plan/WK_0701/list/). CONFIRM: the B3 escalate-recovery assertions
  (~L227-349) run + pass BEFORE that L434 abort (node:assert aborts on first failure, so if a B3 assertion had
  failed the abort would be earlier). Verify B3 assertions assert OUTCOMES (escalate-recovery kind for broken,
  clear for mic-off), not just call presence. Do NOT hold B3 for the pre-existing preflight failure.

## Output
Write verdict to `plan/WK_0701/projcore-run-2026-07-01/batch-B3/independent-validation.md`. Per criterion + red-team lens.

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). The first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh validator batch-B3 <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states: WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO
NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```
Emit **REPRO-CLEARED-ON-LOCAL** if R3a/b/c all hold + mark-stalled gone + tests honest + no red-team break;
**REPRO-STILL-PRESENT** if a real defect remains (name it).

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+validator[[:space:]]+batch-B3[[:space:]]+RECEIVED[[:space:]]+REPRO-CLEARED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: WORKING
