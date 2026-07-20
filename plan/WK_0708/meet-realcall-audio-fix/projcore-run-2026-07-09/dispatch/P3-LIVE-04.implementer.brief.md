<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-P3-LIVE-04: Alternate receive capture (no RTCPeerConnection ctor wrap) + split-host energy smoke

Batch ID: P3-LIVE-04
Plan: Phase 3 .140↔.123; unlock receive energy after INVALID_NO_PC
Branch: batch-01-diagnosis-2026-07-08
Requirements: One PASS live split-host SFU smoke — both publish + receive-side WAV with voiced energy; audioinput already fixed (2966e05 remap-source)
North-star: Phase3 LAUNCH + final exit; maxForks 3; CAP25; burn=0 until acceptance; [projcore] tags only
Lifecycle: pre-live — Deferral OFF

Estimated duration: SHORT — 30min
Effort tier: high · sonnet

Context (P3-LIVE-03 1e0b928 BLOCKED):
- INVALID_NO_PC: installCaptureHook wraps window.RTCPeerConnection via addInitScript; mid-call global is native again; pcCount=0 on bot-140 (receiverPageIndex:0)
- zone.js lead DISPROVEN; defineProperty-lock fails (descriptor resets); reload/crash/iframe ruled out
- B08A-3 local joinDualBrowserCall DID get receive WAV rms>0 historically — split-host path is newly exercised
- Full: decisions/2026-07-10-p3-live-02-invalid-no-pc.md (+ P3-LIVE-03 section)
- DO NOT re-litigate zone.js or defineProperty-lock without new evidence

Primary approach (prefer for PASS this batch):
1. **Bypass constructor hook** for receive energy proof: capture far-end audio from DOM media elements (remote `<audio>`/`<video>` captureStream + MediaRecorder/AudioContext) or equivalent that does NOT require wrapping `window.RTCPeerConnection`.
2. Wire into split-host smoke (p3-live-02-smoke or p3-live-04-smoke): receiverPageIndex 0 (bot-140 hears bot-123 real-virtual-mic); remap-source still required on .123; acceptanceAttempt:false; dwell enough for voiced energy.
3. PASS = both publish + receive WAV with measurable voiced energy (rms>0 or arbiter PASS). Evidence under validation/p3-live-04-evidence/.

Backup / if primary insufficient in PROPOSED:
- Raw CDP: Target/Runtime.executionContextCreated counts to confirm realm swap; then re-install registry or capture accordingly.
- Optional small: room DELETE on throw path in joinDualBrowserCallSplitHost (canDelete only).

Expected:
1. PROPOSED with mechanism choice + files + risks (confirm bypass vs CDP)
2. After APPROVED-PLAN: implement + live smoke PASS or BLOCKED with evidence
3. validation/p3-live-04-changes.md; phase3-counter row; commit
4. Inline cleanup rooms/chrome/tunnel/remap module; no CAP burn

Scope: harness preferred. App only if PROPOSED+APPROVED and minimal. maxForks 3. free -h; avail <2Gi → BLOCKED.

Plan handshake: PROPOSED → wait APPROVED-PLAN → DONE|BLOCKED

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
