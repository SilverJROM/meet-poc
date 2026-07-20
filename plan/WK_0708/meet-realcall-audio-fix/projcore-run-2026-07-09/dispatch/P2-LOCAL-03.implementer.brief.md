<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-P2-LOCAL-03: gum-shim local browser r-grid (fake-device, NO app/SFU join)

Batch ID: P2-LOCAL-03
Plan: Phase 2 = 25 fake-device local ([north]); this batch = local Chromium gum-shim only
Branch: batch-01-diagnosis-2026-07-08
Requirements: AC1 stimulus path — verify forced weak-signal GainNode at r∈{0.50,0.30,0.20,0.10,0.05} (±20%) on real Chromium fake-device; no room join
North-star: Phase2 25 fake-device; maxForks 3; inline cleanup; [projcore] address only
Lifecycle: pre-live — Deferral OFF

Estimated duration: SHORT — 25min
Effort tier: medium · /fast ON · validator L2
Why: browser-local stimulus proof; no SFU

Context:
P2-LOCAL-02 VERIFIED 8044d45 (2-party auto-gain unity unit proof + CAP25).
Existing: e2e/harness/gum-shim.ts + gum-shim.browser.test.ts (r=0.50 only historically).
Phase 2 allows fake-device local Chromium; **NO** joinDualBrowserCall / localhost:4700 room/SFU.

Expected:
1. Extend gum-shim.browser.test.ts (or new b08-local-r-grid.browser.test.ts) to cover r grid {0.50,0.30,0.20,0.10,0.05} with verifyStimulus ±20% vs baseline RMS.
2. Keep throwaway local HTTP server pattern (no meet-poc app). Fake-device + real speech WAV (alice-host or piper hello — speech not tone for fidelity).
3. INVALID control: missing baseline → verifyStimulus undefined / not PASS.
4. Sequential r points if needed; maxForks:3 never raised. Single file vitest run only.
5. Evidence: validation/p2-local-03-changes.md + optional validation/p2-local-03-evidence/rms-table.json
6. Cleanup: no rooms. Delete any temp files you create under /tmp.

Scope: local browser gum-shim only. No product FE change. No SFU. Surgical.

Plan handshake: PROPOSED → wait APPROVED-PLAN → DONE.

Required: validation/p2-local-03-changes.md

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

## Optional pane-STATUS echo (human-readable mirror only)

End your reply with `STATUS: <STATE> — <same short note>`.
