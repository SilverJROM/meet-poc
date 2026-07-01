<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B5 VALIDATION: diagnostics honesty (R5) — grok implementer, audit hard

Role: independent validator (codex55). Implementer was grok (self-report NOT trusted — scrutinize test
validity + scope). Changes UNCOMMITTED on fix/sfu-selfheal-20260701 (`git diff` + new files:
diagnostics-gum-error.ts, diagnostics-layer-snapshot.ts, diagnostics-layer-honesty.spec.ts,
e2e/tests/sfu-b5-diagnostics-layer/).

Batch ID: batch-B5 · Requirement R5.

## Audit
1. **R5a — 406 NOT lastGumError (the point):** confirm a /api/sfu/tracks 406 (or subscribe error) is routed to
   the SUBSCRIBE layer field and is NOT written to lastGumError (device/GUM-only). Read the actual gate logic
   (diagnostics-gum-error.ts / room.page.ts) + the honesty spec. Confirm the spec asserts the OUTCOME (406 →
   subscribe field, lastGumError stays null/device-only), NOT just that a function was called. GROK FAKE-TEST
   CHECK: is the test genuinely exercising the gate, or vacuously passing?
2. **R5b — per-layer fields:** DiagnosticsPayload/layerDiagnostics has SEPARATE device/publish/subscribe/
   recovery/playout/remote-inbound fields, wired from the REAL existing signals (lastGumError,
   lastSubscribeFailureEvidence, lastRecoveryEvent, sfuRejoinThrottled, publishRecoveryFailed,
   advertisedRemotePublisherDiagnostics) — not fabricated/stubbed.
3. **R5c — advertised-not-subscribed surfaced:** the diagnostics page shows it clearly. Verify the e2e
   screenshot (batch-B5/screenshots/) shows the actual diagnostics page with the per-layer fields +
   advertised-not-subscribed — not a blank/login page.
4. **Scope:** confirm B5 did NOT change recovery logic (sfu-client.service.ts recovery methods untouched —
   diff should not touch scheduleRecoveryEscalation/runFullSfuRejoin/escalatePublishFailure).

## Tests (run under timeout)
- `cd frontend && timeout 30 npx tsx src/app/services/diagnostics-layer-honesty.spec.ts`
- confirm ng build passes (or trust prior). Verify any other B5 spec.

## Output
Write verdict to `plan/WK_0701/projcore-run-2026-07-01/batch-B5/independent-validation.md`. Per criterion.

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). The first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh validator batch-B5 <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states: WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO
NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```
Emit **REPRO-CLEARED-ON-LOCAL** if R5a/b/c hold + honest tests + no scope creep; **REPRO-STILL-PRESENT** if a real defect (name it).

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+validator[[:space:]]+batch-B5[[:space:]]+RECEIVED[[:space:]]+REPRO-CLEARED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: WORKING
