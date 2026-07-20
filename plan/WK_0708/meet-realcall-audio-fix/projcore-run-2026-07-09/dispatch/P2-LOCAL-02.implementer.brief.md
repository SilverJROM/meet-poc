<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-P2-LOCAL-02: AC1 local math — 2-party auto-gain no-op + MAX_GAIN table (NO SFU)

Batch ID: P2-LOCAL-02
Plan: Phase 2 DIRECTIVE — 50 local tests, fake-device only, NO SFU
Branch: batch-01-diagnosis-2026-07-08
Requirements assigned: AC1 local proof only (desk prediction → unit evidence). Product gain fix may land if pure unit-testable; no live joinDualBrowserCall.
North-star anchors: PHASE 2 DIRECTIVE; AC1 2-party no-op; maxForks 3; inline cleanup
Lifecycle: pre-live — Deferral policy: OFF.

Estimated duration: SHORT — 25min
Effort tier (PROJCORE-PROPOSED): medium
  Mode chord: /fast ON · Claude thinking none
  Validator topology: 3-agent (validator=codex55 if headroom≥1% else sonnet)
  Why: pure unit product math + table; no SFU

Context:
Phase 2: NO SFU / NO joinDualBrowserCall. P2-LOCAL-01: 143 unit tests PASS baseline.
AC1 og: 2-party → loudest==only remote → raw=max(1,0.88)=1.0 unity no-op → expect A≈r pre-fix.
AUTO_LEVEL_MAX_GAIN=2.5 implies A=min(2.5·r,0.88); A≥0.75 needs r≥0.30 if absolute target used later (B09).
Also finish CAP25 land if uncommitted: DEFAULT_CALL_BURN_CAP=25 + unit loops (from JROM RESET) — include in this commit if dirty.

Observed:
- frontend/src/app/services/remote-audio.service.ts: computeRemoteAutoGains uses remote loudest only.
- No dedicated unit file proving 2-party unity and multi-party boost table.

Expected:
1. Unit tests (vitest, node env, NO chromium, NO SFU) for computeRemoteAutoGains:
   - single remote at levels {0.5,0.3,0.2,0.1,0.05,0.02}: gain stays ~1.0 (2-party no-op)
   - two remotes unequal levels: quieter peer gets gain >1 toward target (proves multi-party path exists)
   - noise floor: levels below AUTO_LEVEL_NOISE_FLOOR ignored
2. Document table r → theoretical A under current max-gain formula vs 2-party unity in validation/p2-local-02-changes.md
3. If product absolute-target fix is small and unit-testable without SFU, implement + tests; else stop at measurement proof (B09 later). Prefer proof-first this batch.
4. Run only: targeted unit files. maxForks=3. No *.browser.test.ts that joins app.
5. Cleanup: none expected (no rooms). If any ledger rooms created, delete via canDelete-registered only.

Likely files:
- frontend unit test path if exists OR e2e/harness/__tests__/remote-auto-gain.test.ts importing from frontend (match repo pattern)
- optional remote-audio.service.ts only if implementing absolute target this batch
- validation/p2-local-02-changes.md

Scope:
- Local only. No SFU. No Playwright dual-browser app join.
- Atomic. Surgical.
- Also commit CAP25 harness constants if working tree still has them.

Plan handshake:
1. Read brief + remote-audio.service.ts computeRemoteAutoGains
2. STATUS: PROPOSED — approach · complexity · why
3. Wait APPROVED-PLAN
4. STATUS: DONE when unit tests green + changes.md

Required artifacts:
- validation/p2-local-02-changes.md
- new/updated unit tests

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

End your reply with `STATUS: <STATE> — <same short note>` for human/transcript readability.
