<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B6 VALIDATION + standard red-team: multi-participant capstone (R6 local)

Role: independent validator + [REDTEAM:standard] (codex55). Implementer Sonnet. Prove the 2p+5p e2e capstone
demonstrates REAL recovery, not a green shell. Changes UNCOMMITTED on fix/sfu-selfheal-20260701.

Batch ID: batch-B6 · Requirement R6 (local part). New: e2e/tests/sfu-b6-multiparty-recovery/; backend
test-only fault-inject route + matchLocation targeting; 3 __meetDebug getters (room.page.ts).

## Audit / attack
1. **R6a 2-person recovery is REAL:** read the 2p scenario. Confirm it injects a 406 (via the test-only route)
   and ASSERTS the affected side RECOVERS — advertised-not-subscribed CLEARS and inbound RTP bytes/energy ADVANCE
   (they can hear each other again) — via the exposed diagnostics, not "page loaded"/attempt-only.
2. **R6b 5-person recovery + coalescing is REAL:** confirm it asserts recovery AND that N simultaneous
   advertised-not-subscribed → exactly ONE sfu-rejoin (via lastRecoveryEvent epochs), proving no rejoin storm.
3. **RE-RUN the scenarios** (they use REAL Cloudflare SFU on isolated ports — set the E2E env vars; ~13s + ~51s):
   `cd e2e && MEET_DB_PATH=/tmp/meet-b6-val.sqlite MEET_RECORDINGS_DIR=/tmp/meet-b6-val-rec E2E_BACKEND_PORT=4830 E2E_FRONTEND_PORT=4831 E2E_PROXY_PORT=4832 E2E_BASE_URL=http://localhost:4832 E2E_WS_ORIGIN=ws://localhost:4832 timeout 7m npm test -w e2e -- tests/sfu-b6-multiparty-recovery --config=playwright.config.ts --workers=1`
   (adjust ports if busy). Confirm both scenarios PASS deterministically. If they flake, note it.
4. **Prod-gating:** confirm the test-only route returns 404 when NODE_ENV=production (grep the guard). Confirm
   the __meetDebug getters are read-only signal exposure (no behavior change) and matchLocation change is in the
   fault-inject test module only (NOT recovery logic — sfu-client.service.ts must be 0 lines changed by B6).
5. Backend: `npm test -w backend -- realtime-sfu` (should be 7/7). If Sonnet reported "244/245" on the full
   backend suite, confirm the 1 non-pass is PRE-EXISTING / unrelated to B6.

## Output
Write verdict to `plan/WK_0701/projcore-run-2026-07-01/batch-B6/independent-validation.md`. Per criterion.

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). The first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh validator batch-B6 <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states: WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO
NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```
Emit **REPRO-CLEARED-ON-LOCAL** if both scenarios prove real recovery + prod-gated + no scope creep;
**REPRO-STILL-PRESENT** if a scenario is a green shell / vacuous, or a real defect (name it).

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+validator[[:space:]]+batch-B6[[:space:]]+RECEIVED[[:space:]]+REPRO-CLEARED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: WORKING
