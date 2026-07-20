<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-P3-LIVE-02: Xvfb + non-headless Chrome on .123 → unlock audioinput + re-run live SFU smoke

Batch ID: P3-LIVE-02
Plan: Phase 3 .140↔.123 live SFU; real-virtual-mic; unblock P3-LIVE-01 FAIL
Branch: batch-01-diagnosis-2026-07-08
Requirements: .123 Chrome must enumerate audioinput; one PASS live split-host SFU smoke (publish both + receive energy)
North-star: Phase3 LAUNCH + final exit procedure; maxForks 3; CAP25; [projcore] tags only
Lifecycle: pre-live — Deferral OFF

Estimated duration: SHORT — 30min
Effort tier: high · sonnet

Context (P3-LIVE-01 666fd22 FAIL/BLOCKED):
- CDP-remote glue works: remote-cdp-host.ts, joinDualBrowserCallSplitHost, p3-live-01-smoke.ts
- Fixed: insecure origin via meet140.localhost MAP; pre-join paplay speech loop
- **Blocker:** headless Chrome on .123 → enumerateDevices has 0 audioinput
- Recommendation from impl: try `Xvfb :99` + non-headless Chrome with DISPLAY=:99

Expected:
1. On .123 via SSH: ensure Xvfb available (install only if needed and allowed, document); launch Chrome **without** --headless under DISPLAY
2. Prove enumerateDevices lists audioinput (diagnostic script ok)
3. Re-run p3-live-01-smoke (or updated) → PASS: both publish + receive energy; acceptanceAttempt:false; <180s; no burn
4. Evidence in validation/p3-live-02-evidence/ (WAV/meta or result.json)
5. Inline cleanup rooms + remote chrome + tunnel
6. validation/p3-live-02-changes.md; phase3-counter row; commit

If Xvfb fails: STATUS: BLOCKED with evidence; do NOT silently downgrade to dual fake-device without PROPOSED+APPROVED.

Scope: harness/env only. maxForks 3. free -h before launch; avail <2Gi → BLOCKED.

Plan handshake: PROPOSED → wait APPROVED-PLAN → DONE

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
