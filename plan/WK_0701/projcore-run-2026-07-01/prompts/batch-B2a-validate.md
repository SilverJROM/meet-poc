<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B2a VALIDATION: audit the recovery coordinator + epoch guard + rungs 1-2 (R2 partial)

Role: independent validator (codex55). USER's clone + agent of R2, NOT the implementer's rubber stamp.
Implementer was Sonnet. Audit CORRECTNESS + honest tests, not just green. Changes are UNCOMMITTED in the
working tree on branch fix/sfu-selfheal-20260701 (read via `git diff`).

Batch ID: batch-B2a
Requirement (R2, verbatim): "When /api/sfu/tracks fails or a remote track stays advertised-not-subscribed,
the app recovers and does NOT terminally give up while the user is admitted and audio is advertised. The
permanent-stop cap escalates retry → renegotiate → full SFU rejoin (fresh cfSessionId) instead of terminal
give-up. Diagnostics record each recovery step + outcome." (B2a = retry→renegotiate + never-give-up
continuation; the rung-3 full rejoin is B2b — out of scope here.)

Approach locked by B0 consensus: deliberation/B0-recovery-ladder/consensus.md. B2a design:
`git diff frontend/src/app/services/sfu-client.service.ts` + new sfu-recovery-coordinator.spec.ts +
rewritten sfu-repro-harness.spec.ts.

## Your audit (the core fix — be rigorous)
1. **Never-give-up invariant (THE point):** Trace that the primary subscribe path (the ~L258 permanent
   stop B1 reproduced) no longer latches a terminal give-up. Confirm `armSubscribeRecoveryLowFrequencyRetry`
   re-arms UNCONDITIONALLY every 30s while `canRunSubscribeRecovery()` holds. Find ANY code path that could
   leave a publisher permanently advertised-not-subscribed while admitted + advertising audio + (mic on).
   If one exists → REPRO-STILL-PRESENT.
2. **Epoch guard correctness:** Confirm ALL opQueue resets go through `resetOpQueue()` (bumps recoveryEpoch)
   — `grep -n "this.opQueue = Promise.resolve()"` should return ONLY the line inside resetOpQueue. Confirm the
   `shouldBindSubscribeResponse` guard in doSubscribeTracks aborts (return, not throw) a stale in-flight bind
   after a reset/rejoin, and that non-recovery callers still work (epoch defaults to current).
3. **No duplicate subs / ghost streams:** escalation clears publisher sub state before re-subscribe;
   subscribedClientIds gating intact; no path double-subscribes or leaks a remote stream.
4. **Escalation bounds match consensus:** rung1 cap 3 / 250·500·1000ms+jitter; rung2 cap 2 / 500·1000ms
   forceRenegotiation; then low-freq 30s continuation emitting needs-rejoin then throttled.
5. **Honest tests (run them):**
   - `cd frontend && npx tsx src/app/services/sfu-repro-harness.spec.ts` (now asserts ESCALATION, not give-up)
   - `cd frontend && npx tsx src/app/services/sfu-recovery-coordinator.spec.ts` (escalation seq + epoch guard)
   - `cd frontend && npx tsx src/app/services/sfu-recovery-epoch.spec.ts`
   Confirm they assert the OUTCOME (escalation continues / stale response does not bind), not that a call fired.
6. **Reproduce-first flip (§1.21):** The B1 give-up repro must now be CLEARED on LOCAL — escalation happens
   instead of a permanent stop. Emit REPRO-CLEARED-ON-LOCAL if confirmed.

Note: room-decisions.spec.ts has a PRE-EXISTING failure (missingPreflightPrereqs / micVerified type) unrelated
to B2a and excluded from ng build — do not hold B2a for it.

## Output
Write verdict to `plan/WK_0701/projcore-run-2026-07-01/batch-B2a/independent-validation.md`. Verdict per the
6 audit points with PASS/GAP + evidence, then overall.

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). The first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh validator batch-B2a <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states: WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO
NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```
You are the VALIDATOR. For B2a: **REPRO-CLEARED-ON-LOCAL** if the fix removes the terminal give-up + tests
honest + no regressions; **REPRO-STILL-PRESENT** if a terminal give-up path survives or a test is vacuous;
**NEEDS-INFO** if blocked.

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+validator[[:space:]]+batch-B2a[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: WORKING
