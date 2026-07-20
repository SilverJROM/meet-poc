<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-P2-LOCAL-05: Call-ledger/driver unit + CAP25 regression (no live join)

Batch ID: P2-LOCAL-05
Plan: Phase 2 = 25 fake-device local
Branch: batch-01-diagnosis-2026-07-08
Requirements: CAP25 locked; conditional burn; fail-closed; logCall; unit tests green; clean residual dirty CAP test loops from worktree
North-star: CAP25 JROM RESET; maxForks 3; [projcore] tags only
Lifecycle: pre-live — Deferral OFF

Estimated duration: SHORT — 15min
Effort tier: routine · /fast ON

Context:
CAP25 already in call-ledger.ts (8044d45). Worktree may still have uncommitted call-driver.ts CAP loop renames (25/26) from aborted B08 — land or discard consistently.
Also weakSignalRatio hook may be uncommitted in call-driver — keep if pure and unit-tested; no SFU usage required this batch.

Expected:
1. npx vitest run harness/__tests__/call-ledger.test.ts harness/__tests__/call-driver.test.ts → all pass with CAP=25
2. Align call-driver.test.ts loops (26) and messages (25-cap) if still dirty
3. Unit-only for call-driver (skip or leave browser-dependent tests as existing skips)
4. validation/p2-local-05-changes.md
5. Commit residual harness CAP/driver cleanliness. NO joinDualBrowserCall live runs.

Plan handshake: PROPOSED → APPROVED-PLAN → DONE

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
