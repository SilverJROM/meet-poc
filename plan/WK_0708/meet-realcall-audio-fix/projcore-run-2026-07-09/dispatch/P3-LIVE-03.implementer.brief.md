<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-P3-LIVE-03: Fix INVALID_NO_PC receive capture on split-host + re-smoke live SFU energy

Batch ID: P3-LIVE-03
Plan: Phase 3 .140↔.123 live SFU; real-virtual-mic; unblock P3-LIVE-02 receive energy
Branch: batch-01-diagnosis-2026-07-08
Requirements: One PASS live split-host SFU smoke: both publish + receive-side WAV with voiced energy; audioinput path already fixed (2966e05 remap-source)
North-star: Phase3 LAUNCH + final exit; maxForks 3; CAP25; burn=0 until real acceptance; [projcore] tags only
Lifecycle: pre-live — Deferral OFF

Estimated duration: SHORT — 30min
Effort tier: high · sonnet

Context (P3-LIVE-02 2966e05 BLOCKED partial):
- Audioinput SOLVED: loadRemoteVirtualMic / module-remap-source; headless OK; Xvfb disproven
- Both legs join+publish live (server sfu-publish; waitForPublishedAudioBytes)
- **Blocker:** receive-side-recorder installCaptureHook sees pcCount=0 on bot-140; mid-call window.RTCPeerConnection is native again (hook installed, then clobbered). zone.js RTCPeerConnection patch is leading suspect.
- Full writeup: decisions/2026-07-10-p3-live-02-invalid-no-pc.md
- Also: joinDualBrowserCallSplitHost room DELETE doesn't run if stopReceiveSideRecording throws — fix cleanup if cheap

Expected (acceptance):
1. Mechanism-level fix so capture sees live PC(s) on split-host path (prototype-level hook or re-install after zone, or equivalent proven approach) — PROPOSED first
2. Re-run p3-live-02-smoke (or p3-live-03-smoke) → PASS: both publish + receive WAV energy (rms>0 or arbiter PASS)
3. acceptanceAttempt:false; purpose smoke; no CAP burn; <180s preferred
4. Evidence in validation/p3-live-03-evidence/ (WAV+meta or result.json)
5. Inline cleanup: rooms (canDelete only), remote chrome, tunnel, unload remap module
6. validation/p3-live-03-changes.md; phase3-counter row; commit
7. If still BLOCKED: evidence + STATUS:BLOCKED — no false-green

Scope: harness only preferred (receive-side-recorder / call-driver split-host). App frontend only if proven necessary and PROPOSED+APPROVED. maxForks 3. free -h before launch; avail <2Gi → BLOCKED.

Plan handshake: PROPOSED → wait APPROVED-PLAN → implement → DONE or BLOCKED

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
