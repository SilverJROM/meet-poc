<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-P3-LIVE-05: .140 null-sink audio backend + re-smoke DOM capture energy PASS

Batch ID: P3-LIVE-05
Plan: Phase 3 .140↔.123; unlock receive energy (silent WAV after DOM capture)
Branch: batch-01-diagnosis-2026-07-08
Requirements: One PASS live split-host SFU smoke — both publish + receive WAV rms>0 (DOM capture path 2cf5efb)
North-star: Phase3 LAUNCH + final exit; maxForks 3; CAP25; burn=0; [projcore] tags only
Lifecycle: pre-live — Deferral OFF

Estimated duration: SHORT — 30min
Effort tier: high · sonnet

Context (P3-LIVE-04 2cf5efb BLOCKED partial):
- DOM captureStream bypass WORKS: element found, 262144 samples, pipeline healthy, but **exact digital silence** (rms=0)
- Synthetic oscillator→MediaStreamDestination→captureStream on .140 gets real signal (headless OK)
- .140 has **no** pactl/pipewire/pulseaudio **server** (only client libs) — leading silence hypothesis
- Full: decisions/2026-07-10-p3-live-02-invalid-no-pc.md P3-LIVE-04 section + validation/p3-live-04-changes.md
- DO NOT re-litigate ctor-hook / zone.js

Expected:
1. PROPOSED: plan for minimal audio sink on .140 (prefer pulseaudio-null / pipewire null-sink; document install path; if sudo required and unavailable → BLOCKED with evidence, do not invent fake PASS)
2. Isolation test first: WebRTC-track-backed (or real playout) captureStream on .140 with sink present → maxAbs/rms>0 before full SFU
3. Re-run p3-live-04-smoke (or p3-live-05-smoke) with remap-source on .123 + DOM capture on .140 → PASS both publish + rms>0
4. acceptanceAttempt:false; evidence validation/p3-live-05-evidence/; cleanup rooms/chrome/tunnel/modules
5. validation/p3-live-05-changes.md; phase3-counter row; commit
6. If package install not allowed / fails: STATUS:BLOCKED — do not move receiver to .123 unless PROPOSED+APPROVED as explicit topology change

Scope: env + harness smoke only. No app product code. maxForks 3. free -h; avail <2Gi → BLOCKED.

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
