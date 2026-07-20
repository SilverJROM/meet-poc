<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-P3-LIVE-08: Stereo channelCount=2 silence lead + force mono / stereo-safe capture → energy PASS

Batch ID: P3-LIVE-08
Plan: Phase 3 .140↔.123; silence after AGC/NS/EC disproven; stereo vs mono gap
Branch: batch-01-diagnosis-2026-07-08
Requirements: One PASS live split-host SFU smoke — both publish + receive rms>0
North-star: Phase3 LAUNCH + final exit; maxForks 3; CAP25; burn=0; [projcore] tags only
Lifecycle: pre-live — Deferral OFF

Estimated duration: SHORT — 30min
Effort tier: high · sonnet

Context (P3-LIVE-07 47fe2d0 BLOCKED partial):
- e2eDisableAudioProcessing=1 shipped+verified: getSettings AGC/EC/NS all false on bot-123
- Still exact silence; inbound RTP still advances
- getSettings also shows channelCount:2 (stereo); prior isolation tests that got energy used unconstrained/mono gUM
- Capture graph createScriptProcessor(4096, 1, 1) forces 1-channel — untested against real stereo WebRTC track
- Keep: remap-source, pulse null-sink, e2eDisableAudioProcessing=1, raw stream capture
- Full: decisions P3-LIVE-07 section + validation/p3-live-07-changes.md

Expected:
1. PROPOSED: pick mechanism(s) — (a) isolation test: stereo WebRTC/track → same ScriptProcessor capture path, prove silence or energy; (b) force channelCount:1 in e2eDisableAudioProcessing / audioCaptureConstraints when processing disabled; (c) stereo-safe ScriptProcessor (2 in → mono mix) in dom-audio-capture. Prefer smallest proven fix.
2. After APPROVED-PLAN: implement; ng build if product constraints change; free -h; live smoke acceptanceAttempt:false
3. PASS = both publish + rms>0; evidence validation/p3-live-08-evidence/; confirm channelCount if constrained
4. If still silent: STATUS:BLOCKED with new evidence (not false-green)
5. changes.md; phase3-counter; commit; cleanup

Scope: harness + optional query-gated product channelCount:1. maxForks 3.

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
