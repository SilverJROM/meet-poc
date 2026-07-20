<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-P3-LIVE-01: Phase 3 topology .140↔.123 + first live SFU smoke (real-virtual-mic)

Batch ID: P3-LIVE-01
Plan: [north] Phase 3 LAUNCH — .140↔.123 live real-call; 25 SFU calls; real-virtual-mic
Branch: batch-01-diagnosis-2026-07-08
Requirements: Establish runnable dual-machine live path; one successful dual-browser SFU join with real-virtual-mic where required; document topology; inline room cleanup
North-star: Phase3 GO correction 2026-07-10; maxForks 3; CAP25; ABS_TARGET 0519d09 served
Lifecycle: pre-live — Deferral OFF

Estimated duration: SHORT — 30min
Effort tier: high · sonnet · no SFU-free unit-only

Context:
- Coord host: 192.168.254.140 (this repo, PM2 meet-poc :4700 after ng build).
- .123: silverjrom@192.168.254.123 jromhost — PipeWire/pactl; real-virtual-mic ONLY valid on .123 (call-driver host gate).
- Product: ABS_TARGET=0.5 in remote-audio.service.ts (0519d09) — FE rebuilt.
- CallDriver: joinDualBrowserCall, deviceMode required, acceptanceAttempt true burns if ≥180s.
- Budget: CAP 25, current burn 0. Prefer short smoke (<180s, acceptanceAttempt:false) for first join unless proving acceptance.
- maxForks: 3 HARD. Inline cleanup: registerCreatedID rooms → delete only canDelete IDs; never 652c1475/testroom01001.

Expected:
1. PROPOSED: concrete topology for .140↔.123 (e.g. run one browser/process on .123 via SSH or document if both browsers must co-locate; if co-locate only on .123 with BASE_URL pointing at .140:4700, say so). Must use real-virtual-mic for at least the leg that needs OS mic; other leg may be fake-device+speech if dual-machine asymmetric is required — state and justify.
2. Implement any minimal harness glue (SSH remote launch / env BASE_URL / MEET_REAL_MIC_HOST) needed — no product scope creep.
3. One live SFU dual-join smoke that PASSes: both publish, receive energy or counters advance, room cleaned.
4. validation/p3-live-01-changes.md + evidence under validation/p3-live-01-evidence/
5. Log burns to ledger; phase3-counter row.
6. Commit when green.

Scope guards:
- Do NOT run full 25 calls this batch — topology + smoke only.
- Do NOT raise maxForks.
- Do NOT delete protected IDs.

Plan handshake: PROPOSED → wait APPROVED-PLAN → DONE

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
