<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-P2-LOCAL-06: AC1 absolute target-loudness product fix (unit-tested; Phase 2 fake-device)

Batch ID: P2-LOCAL-06
Plan: og-requirements AC1 + D28 absolute target-loudness; Phase 2 = 25 fake-device local
Branch: batch-01-diagnosis-2026-07-08
Requirements assigned: AC1 core fix — absolute target reference (NOT remote-loudest-only), so weak remotes get gain even in 2-party
North-star: Phase2 fake-device; AC1 2-party currently unity no-op (proven P2-LOCAL-02) — THAT is the defect; maxForks 3; [projcore] tags only
Lifecycle: pre-live — Deferral OFF

Estimated duration: SHORT — 30min
Effort tier: high · thinking hard · validator L2/L3 if product path
Why: product audio path; AC1 unblocks only after absolute target

Context (binding):
- computeRemoteAutoGains today: raw = max(1, min(2.5, (loudest * 0.88) / level)) over remotes only → 2-party always A=1.0 (P2-LOCAL-02 proven).
- AC1 needs weak signal boosted: absolute target-loudness reference (desk: A = min(2.5·r, 0.88) style when using absolute target, not relative loudest).
- Do NOT use local publisher level as reference (og-req). Guard ≥3-party (AC17): don't regress multi-party.
- Phase 2: unit tests + optional no-app browser only. NO joinDualBrowserCall live SFU. Fake-device dual-browser local app only if essential and short; prefer pure unit.
- FE rebuild note: product change needs ng build for live serve later — document; this batch gates on unit.

Expected:
1. Mechanism-level PROPOSED: how absolute target replaces loudest-relative for auto-gain; multi-party behavior preserved or improved; noise floor + max gain + smoothing retained.
2. Implement in remote-audio.service.ts (or extracted pure module unit-testable).
3. Extend remote-auto-gain.test.ts:
   - 2-party quiet remote (level 0.2, 0.1, 0.05): gain > 1.0 toward absolute target (NOT unity)
   - multi-party still sensible (no runaway)
   - noise floor still ignored
4. validation/p2-local-06-changes.md (User Report, Root Cause, formula before/after)
5. Targeted vitest only. maxForks 3. Commit when green.

Scope guards:
- No SFU live dual-browser unless you prove unit insufficient in PROPOSED and get APPROVED-PLAN for one fake-device local join.
- No AC3 ramp work (AudioParam) this batch.
- Surgical.

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
