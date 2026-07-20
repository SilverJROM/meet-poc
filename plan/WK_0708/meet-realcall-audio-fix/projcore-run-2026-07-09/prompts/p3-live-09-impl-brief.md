<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-P3-LIVE-09: Stack 3 additional live split-host energy PASSes (smoke) toward 25

Batch ID: P3-LIVE-09
Plan: Phase 3 .140↔.123; path unlocked at 1/25 by P3-LIVE-08 9f2b7be
Branch: batch-01-diagnosis-2026-07-08
Requirements: 3 more live SFU smokes with both publish + receive rms>0; acceptanceAttempt:false; no CAP burn
North-star: Phase3 toward 25 PASS; final exit only at 25 or CAP exhausted; maxForks 3; CAP25; [projcore] tags only
Lifecycle: pre-live — Deferral OFF

Estimated duration: SHORT — 30min
Effort tier: high · sonnet

Context (P3-LIVE-08 9f2b7be PASS — first energy):
- Fix: startRawRemoteStreamCapture play dedicated <audio> then captureStream
- Live: publishedBytes>0 both + rms=0.087941 (PCM re-verified by coord)
- Keep: remap-source, pulse null-sink .140, e2eDisableAudioProcessing=1 on speaker2
- Counter now 1/25 smoke PASS, burn=0

Expected:
1. PROPOSED: re-use p3-live-08-smoke (or p3-live-09 runner) to execute 3 sequential smokes; free -h before each; inline cleanup
2. After APPROVED-PLAN: run 3 smokes acceptanceAttempt:false; each must both publish + rms>0
3. Evidence validation/p3-live-09-evidence/ with per-run result.json + WAV or summary table
4. Update phase3-counter to 4/25 if all 3 PASS (1 prior + 3)
5. If any FAIL: STOP, report STATUS:BLOCKED with that run's evidence; do not false-green
6. changes.md; commit; burn must stay 0

Scope: harness smoke only. No product changes unless PROPOSED for a new blocker. maxForks 3.

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
