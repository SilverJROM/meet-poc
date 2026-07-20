<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-P3-LIVE-11: Stack 8 more live split-host energy PASSes (smoke) toward 25

Batch ID: P3-LIVE-11
Plan: Phase 3 .140↔.123; path stable at 9/25 after P3-LIVE-10 3e03e1d
Branch: batch-01-diagnosis-2026-07-08
Requirements: 8 sequential live SFU smokes both publish + rms>0; acceptanceAttempt:false; burn stay 0
North-star: Phase3 toward 25 PASS; exit only at 25 or CAP exhausted; maxForks 3; CAP25; [projcore] tags only
Lifecycle: pre-live — Deferral OFF

Estimated duration: SHORT — 30min
Effort tier: medium · sonnet

Context: Mechanism proven 9 consecutive smokes PASS; counter 9/25; reuse RUN_INDEX smoke pattern; distinct CDP port.

Expected:
1. PROPOSED: 8 sequential smokes free -h each; stop on first FAIL
2. After APPROVED-PLAN: run; evidence validation/p3-live-11-evidence/; summary
3. If all PASS: phase3-counter → 17/25; burn 0
4. changes.md; commit; cleanup each
5. No product changes unless new blocker

Scope: harness smoke only. maxForks 3.

Plan handshake: PROPOSED → wait APPROVED-PLAN → DONE|BLOCKED

Repo: /home/agjrom/websites/meet-poc
Run: /home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09

---

## Streaming-order mandate (root cause of pre-v4 stalls — JROM 2026-06-06 panel-locked)

**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). Not the first sentence — the first TOOL CALL, BEFORE any prose tokens stream. This is a buffer-flush guarantee: if your session is interrupted between prose-streaming and the tool call, the callback never lands and projcore stalls. Append first, prose after.**

## Callback emission — the ONLY sanctioned form

Use the helper. Do not hand-write `>>` redirection — the helper validates role/state/note and locks atomically:

```
PROJCORE_CALLBACKS_FILE=<abs-path-to-callbacks.md> \
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
