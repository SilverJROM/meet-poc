<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B1 VALIDATION: audit the SFU non-healing reproduction harness (R1)

Role: independent validator (codex55). You are the USER's clone + agent of the OG requirements —
NOT the implementer's rubber stamp. The implementer was grok (self-report NOT trusted). Audit test
VALIDITY, not just that tests are green. A green test over a non-reproduced requirement = FAIL.

Batch ID: batch-B1
Requirement (R1, verbatim): "A local/dev test path can reproduce SFU subscription failure without
waiting for Cloudflare to fail live. Acceptance: (a) force /api/sfu/tracks 406 for a selected
participant; (b) advertised-but-never-subscribed; (c) subscribed inbound audio with no usable
progress; (d) current non-healing / give-up behavior reproduced (fails) BEFORE any fix."

Implemented commit: 6643a02 on branch fix/sfu-selfheal-20260701. Touched files:
- backend/src/modules/realtime-sfu/sfu-fault-inject.ts (new), index.ts (+hook), tests/realtime-sfu.test.ts
- frontend/src/app/services/sfu-repro-harness.spec.ts (new, 316L), sfu-recovery-epoch.ts (+spec),
  sfu-subscribe-failure-evidence.ts (new), sfu-client.service.ts (+evidence instrumentation),
  frontend/src/app/pages/room/room-decisions.spec.ts (+mark-stalled repro block)

## Your audit (Q0 + Q1/Q6 focus — this is a test-infra batch, no user-visible UI)
1. **Honest reproduction (Q0/Q6):** For EACH of R1 (a)(b)(c)(d), name the test that reproduces it and
   confirm it asserts the OUTCOME (the actual give-up state — cap latched / mark-stalled / advertised-
   not-subscribed / zero post-cap POST), not merely that a call fired. Read the test SOURCE; run them:
   - `cd backend && npx vitest run tests/realtime-sfu.test.ts`
   - `cd frontend && npx tsx src/app/services/sfu-repro-harness.spec.ts`
   - `cd frontend && npx tsx src/app/services/sfu-recovery-epoch.spec.ts`
2. **No hidden fix (CRITICAL — grok fake-test risk):** Confirm the recovery/give-up logic is UNCHANGED
   by B1 — `nextSubscribeRetry`/`planSubscribeRetry` cap and `decideRemoteVoiceWatchdogAction`
   mark-stalled must be untouched. A repro that "passes" because grok half-implemented the fix = REVISE.
   Confirm sfu-recovery-epoch.ts is an INERT pure predicate (not wired into the live subscribe path)
   and the sfu-client.service.ts change is instrumentation-only (sets lastSubscribeFailureEvidence,
   does not alter retry/give-up flow).
3. **Fault injection safety:** Confirm sfu-fault-inject.ts is strictly env/test-gated and cannot fire
   in a production path.
4. **406 evidence (R5 setup):** Confirm 406 fields are captured AND isLastGumErrorCandidate(406) === false
   (406 not mislabeled as a mic/GUM error).
5. **Pre-existing failure sanity:** room-decisions.spec.ts has a PRE-EXISTING failure at ~L400
   (`missingPreflightPrereqs` expects ['mic','speaker'], gets ['mic']) — confirm it exists at base
   e9aedff and is NOT caused by B1 (B1 did not touch room-decisions.ts production). Flag only; not B1's bug.

## Output
Write your independent verdict to:
`plan/WK_0701/projcore-run-2026-07-01/batch-B1/independent-validation.md` (OVERWRITE grok's self-version).
Per R1 criterion (a/b/c/d) give PASS/GAP with the covering test + 1-line evidence. Then overall verdict.

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). Not the first sentence — the first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh validator batch-B1 <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states: WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO
NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```
(You are the VALIDATOR — use only the validator states above; the implementer line is present only to satisfy the dispatch contract.)
For B1 (the repro harness itself): emit **REPRO-CONFIRMED** if the harness validly + honestly reproduces
the give-up for all of R1 (a-d); **REPRO-FAILED** if a case is not genuinely reproduced or a hidden fix
makes a test vacuous; **NEEDS-INFO** if blocked.

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+validator[[:space:]]+batch-B1[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>` for readability. Callback file wins if they differ.

STATUS: WORKING
