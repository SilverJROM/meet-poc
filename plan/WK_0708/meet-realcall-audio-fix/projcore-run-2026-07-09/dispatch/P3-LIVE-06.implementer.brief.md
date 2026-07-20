<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-P3-LIVE-06: Inbound RTP stats deltas on page1 + fix path to live energy PASS

Batch ID: P3-LIVE-06
Plan: Phase 3 .140↔.123; diagnose voice-stalled / silent receive after null-sink proven
Branch: batch-01-diagnosis-2026-07-08
Requirements: Prove whether inbound audio RTP advances at page1 from bot-123; if not, fix harness/topology so live smoke gets rms>0 (both publish + DOM energy)
North-star: Phase3 LAUNCH + final exit; maxForks 3; CAP25; burn=0; [projcore] tags only
Lifecycle: pre-live — Deferral OFF

Estimated duration: SHORT — 30min
Effort tier: high · sonnet

Context (P3-LIVE-05 8d55b05 BLOCKED partial):
- .140 PulseAudio null-sink INSTALLED + PROVEN: isolation maxAbs≈1.075 (keep daemon)
- Live smoke still rms=0; __meetDebug remoteAudioMixer: peer in blockedPeerIds, voiceRecoveryCounters.resume:1 → voice-stalled from inbound SFU stats watchdog
- Both legs still report publishedBytes>0 (sender-side); need inbound packetsReceived/bytesReceived deltas over dwell
- Full: decisions/2026-07-10-p3-live-02-invalid-no-pc.md P3-LIVE-05 section + validation/p3-live-05-changes.md
- DO NOT reinstall pulse; DO NOT re-litigate ctor-hook/zone

Expected:
1. PROPOSED: instrument onLive dwell to sample __meetDebug.sfuGetStats() (or equivalent) inbound audio stats at t0 and t1 on page1; report deltas for remote peer; also page2 outbound if useful
2. After APPROVED-PLAN: run live split-host smoke (remap-source + DOM capture, acceptanceAttempt:false) with stats evidence
3. If inbound advances but silence: re-open playout/capture path with new evidence
4. If inbound does NOT advance: mechanism-level fix for split-host media path (ICE/CDP/host-alias/SFU subscribe) — harness preferred; product only if PROPOSED+APPROVED; aim for rms>0 PASS
5. Evidence validation/p3-live-06-evidence/ (stats JSON + WAV if any); changes.md; phase3-counter; commit
6. Inline cleanup; no CAP burn

Scope: harness + diagnostics first; topology/env fixes ok. maxForks 3. free -h; avail under 2Gi → BLOCKED.

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
