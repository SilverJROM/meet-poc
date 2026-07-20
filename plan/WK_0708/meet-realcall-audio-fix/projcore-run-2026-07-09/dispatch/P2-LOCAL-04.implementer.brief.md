<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-P2-LOCAL-04: Capture-injection + recording-arbiter local INVALID≠PASS suite

Batch ID: P2-LOCAL-04
Plan: Phase 2 = 25 fake-device local ([north])
Branch: batch-01-diagnosis-2026-07-08
Requirements: INVALID≠PASS arbiter paths; capture-injection unit (no SFU)
North-star: Phase2 25 fake-device; maxForks 3; inline cleanup; [projcore] tags only
Lifecycle: pre-live — Deferral OFF

Estimated duration: SHORT — 20min
Effort tier: medium · /fast ON

Context:
P2-LOCAL-03 VERIFIED (gum r-grid). Existing: b07-capture-injection.test.ts, recording-arbiter via gum-shim tests, receive-side-recorder tests.
Ensure full INVALID≠PASS matrix is unit-covered; extend only if gaps.

Expected:
1. Run + audit: b07-capture-injection.test.ts, gum-shim.test.ts, recording-arbiter paths, receive-side-recorder.test.ts
2. Fill gaps: any missing INVALID vs FAIL vs PASS distinctions for dead baseline / out-of-tolerance / verified
3. NO joinDualBrowserCall, NO app SFU. Unit-only preferred; browser only if already local-no-app pattern.
4. validation/p2-local-04-changes.md with coverage matrix
5. maxForks 3. Commit when green.

Plan handshake: PROPOSED → APPROVED-PLAN → DONE

Repo: /home/agjrom/websites/meet-poc
Run: /home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09

---

## Streaming-order mandate (root cause of pre-v4 stalls — JROM 2026-06-06 panel-locked)

**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). Not the first sentence — the first TOOL CALL, BEFORE any prose tokens stream. This is a buffer-flush guarantee: if your session is interrupted between prose-streaming and the tool call, the callback never lands and projcore stalls. Append first, prose after.**

## Callback emission — the ONLY sanctioned form

Use the helper. Do not hand-write `>>` redirection — the helper validates role/state/note and locks atomically:

```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh <role> <batch-id> <STATE> "<note>"
```

The dispatch gateway pre-bakes `PROJCORE_CALLBACKS_FILE=<abs-path>` so you can copy the line verbatim.

The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)

```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states:   WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO

NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```

The helper REJECTS coordinator-only states and any unknown token. Use WORKING only for non-terminal progress (first reply if no routeable state yet, or any reply >2min since last callback). Emit terminal/handshake state directly when you have it.

## ACK stop-rule

Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+<your-role>[[:space:]]+<your-batch-id>[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — **STOP emitting callbacks for this batch.** Coordinator has received your state.

## Optional pane-STATUS echo

End your reply with `STATUS: <STATE> — <same short note>`.
