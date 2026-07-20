<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-P3-LIVE-07: Disable Chrome AGC/NS/EC for real-virtual-mic + live energy PASS

Batch ID: P3-LIVE-07
Plan: Phase 3 .140↔.123; Chrome capture processing gates PipeWire loopback as non-voice
Branch: batch-01-diagnosis-2026-07-08
Requirements: One PASS live split-host SFU smoke — both publish + receive energy rms>0 (raw or DOM capture)
North-star: Phase3 LAUNCH + final exit; maxForks 3; CAP25; burn=0; [projcore] tags only
Lifecycle: pre-live — Deferral OFF

Estimated duration: SHORT — 30min
Effort tier: high · sonnet

Context (P3-LIVE-06 7256831 BLOCKED partial — product change NOW in scope):
- Inbound RTP PROVEN 1:1 (not SFU): inbound-stats Δpackets≈303 ≈ outbound
- Fixed double-AudioContext hop: startRawRemoteStreamCapture taps sfuRemoteStreams
- Ground truth: parecord on .123 virtual_mic has real signal (no Chrome)
- bot-123 track getSettings: autoGainControl=true, echoCancellation=true, noiseSuppression=true
- Lead: Chrome NS/EC/AGC suppresses PipeWire-looped speech before encode
- Full: decisions/...-invalid-no-pc.md P3-LIVE-06 + validation/p3-live-06-changes.md
- Keep pulse on .140; remap-source on .123; DO NOT re-litigate SFU/RTP delivery

Expected:
1. PROPOSED: minimal product change path — set echoCancellation/noiseSuppression/autoGainControl false for real-virtual-mic / harness-detectable path (prefer flag/query/env or deviceMode real-virtual-mic only; do NOT break default user call path without justification). Cite media.service.ts / room.page gUM sites.
2. After APPROVED-PLAN: implement; ng build if FE changes; re-run p3-live-06-smoke or p3-live-07-smoke with acceptanceAttempt:false
3. PASS = both publish + receive rms>0 (prefer raw remote stream capture already shipped); write evidence under validation/p3-live-07-evidence/
4. Confirm getSettings shows false for AGC/NS/EC on bot-123 mid-call
5. changes.md; phase3-counter; commit; cleanup rooms/chrome/tunnel/modules
6. If still silent with constraints false: STATUS:BLOCKED with new evidence (not false-green)

Scope: product constraint override + harness smoke. maxForks 3. free -h before launch; avail <2Gi → BLOCKED (note mem may be tight).

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
