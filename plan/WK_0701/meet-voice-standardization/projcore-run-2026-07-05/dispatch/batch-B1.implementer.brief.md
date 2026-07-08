<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B1: Correct and prove faster mic self-heal retry state

Batch ID: batch-B1
Plan: /home/agjrom/websites/meet-poc/plan/WK_0701/meet-voice-standardization/projcore-run-2026-07-05/implementation-plan.md
Branch: feat/voice-standardization-batch-1-mic-silence-retry
Requirements assigned: R1
North-star anchors: R1 persistent mic-silence self-heal; remote validation addendum
Lifecycle: pre-live — Deferral policy: OFF. Read `~/.codex/skills/projcore/references/deferral-policy.md`. Under OFF: no TODO/FIXME, no "follow-up PR," no dead-code shims, no @deprecated markers without a queue.md row in THIS run. Uncertainty = STATUS: NEEDS-INFO, not a defer.

Estimated duration: SHORT — 30min
(non-test should be SHORT/atomic per §1.4c; >30min non-test means this brief should have been split)

Effort tier (PROJCORE-PROPOSED — codex confirms or counter-proposes at PROPOSED): high
  Mode chord: codex effort high · Grok effort high · optional Claude thinking marker none
  Validator topology: 3-agent (validator=codex55)
  Why: CR1 red-team found concurrency/state-budget bugs in user-facing audio recovery.
  (Auto-pair: /fast ON iff tier ∈ {routine, medium}. Codex: counter-propose tier if a hidden seam warrants higher; conflict → higher wins, logged.)

Context (from context-handoff.md):
The mic-silence retry fix is already on branch HEAD, but B1 red-team CR1 found bugs before acceptance.
You are doing only the CR1 correction for R1, not later audio/reconnect/password/icon work.
Coordinator will run a second red-team round after your correction and then remote DEV/Peer2 validation.
Keep the diff tight and leave auditable artifacts under this run's batch-B1 folder.

Requirements section (verbatim from og-requirements.md):
"## R1 — Persistent mic-silence self-heal

Status carried forward: implemented and independently validated on commit d2cbce9, but not merged
or deployed. Remaining acceptance for this continuation:
- Run the owed standard-tier red-team pass.
- Produce the owed post-fix regression proof for retry cadence, or document a concrete blocker."

Observed (current state):
- CR1 synthesis at `/home/agjrom/websites/meet-poc/plan/WK_0701/meet-voice-standardization/projcore-run-2026-07-05/redteam/B1-mic-silence-retry/synthesis-CR1.md` is BUGS.
- `frontend/src/app/pages/room/room.page.ts` persists `nextSweepGate()` output before proving a recovery sweep is eligible in both `verifyInitialCaptureEnergy()` and `pollMicSilenceWatchdog()`.
- `runMicRecoverySweep()` can early-return while `micSweepInProgress` is true before its `finally`, so callers can consume budget without a real sweep/cooldown.
- Adopted recovery clears the warning but leaves stale `micSilenceWindow` samples that can re-trigger retry copy from old low-energy data.
- Terminal/exhausted banner ownership can be overwritten by later non-exhausted/cooldown polling.
- Existing reducer tests in `frontend/src/app/services/mic-sweep.spec.ts` pass but do not cover adapter-level blocked/in-flight or banner/window cleanup paths.

Expected (acceptance criteria):
- Never mutate `micSweepGateState` to a consumed attempt unless a recovery sweep is eligible to run.
- Initial capture must not advance gate state when `micSweepInProgress` or `audioRecoveryInFlight` is true, or when the mic is no longer active after sampling.
- Watchdog must early-return without gate consumption while `audioRecoveryInFlight` is true.
- Successful adopted recovery must clear stale silence samples so retry banners cannot reappear from old data.
- Terminal/exhausted banner ownership must be consistent: watchdog gate exhaustion is authoritative for exhausted copy, and sweep side-effects are not immediately overwritten into misleading retry copy.
- Add targeted tests for no-consumption-while-blocked and banner/window cleanup behavior.
- Keep existing retry cadence and reducer behavior intact.
- `cd frontend && npx tsx src/app/services/mic-sweep.spec.ts` passes.
- `cd frontend && npm run build` passes, allowing only known pre-existing warnings.

Likely files:
- frontend/src/app/pages/room/room.page.ts
- frontend/src/app/services/mic-energy.ts
- frontend/src/app/services/mic-sweep.spec.ts
- plan/WK_0701/meet-voice-standardization/projcore-run-2026-07-05/batch-B1/*

Scope:
- Implement only what's in this brief for Req#s R1.
- This is ONE atomic vertical slice (§1.4c): tight diff, provable by ~1-3 focused tests. If your PROPOSED plan is bigger, say so — propose a split, don't silently widen.
- Do not change room password/admission, transcript grouping, Ionicons, reconnect, codec, host indicator, volume balancer, preflight, or e2e fixture behavior.
- Do not deploy, restart remote targets, wake dev_machine, or touch Peer2's machine from this dispatch.
- Surgical only. No "while I'm in here" scope creep.
- Robust polled assertions, not one-shot checks. Assert the OUTCOME, never just that an action fired.
- Escape valve: if the ideal proof is infeasible, fall back to the simpler proof and note it.

Plan handshake protocol (MANDATORY before implementation):
1. Read this brief in full. Read referenced files.
2. Reply with PROPOSED: mechanism-level diagnosis + planned files + risks + estimate confirmation.
3. Confirm or counter-propose the effort tier (one-line "why"). Higher wins on conflict.
4. End reply with: STATUS: PROPOSED — <one-line approach> · complexity: <confirmed-or-counter> · why: <one line>.
5. Wait for projcore APPROVED-PLAN before writing code.
6. If REVISE-PLAN returned, address gaps, re-emit STATUS: PROPOSED.

After APPROVED-PLAN:
7. Implement at the agreed mode chord — set `/model` (codex) or apply thinking marker (Claude) per APPROVED-PLAN tier. Default-cap at medium; auto-escalate to high on the 2nd send-back on this task (log in changes.md).
8. Reply with STATUS: DONE — <one-line summary> when build + targeted tests green.

Required artifacts:
- batch-B1/scenarios.md
- batch-B1/changes.md (User Report verbatim + Root Cause mechanism + Code Changes per-file WHY)
- batch-B1/review.md
- batch-B1/test-report.md
- batch-B1/screenshots/
- batch-B1/independent-validation.md
- decisions/<YYYY-MM-DD>-<slug>.md per §1.15 — MANDATORY for any non-trivial autonomous call (if none, state explicitly: "Autonomous decisions: none").

---

## Streaming-order mandate (root cause of pre-v4 stalls — JROM 2026-06-06 panel-locked)

**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). Not the first sentence — the first TOOL CALL, BEFORE any prose tokens stream.** This is a buffer-flush guarantee: if your session is interrupted between prose-streaming and the tool call, the callback never lands and projcore stalls. Append first, prose after.

## Callback emission — the ONLY sanctioned form

Use the helper. Do not hand-write `>>` redirection — the helper validates role/state/note and locks atomically:

```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/meet-voice-standardization/projcore-run-2026-07-05/callbacks.md \
  ~/.codex/skills/projcore/lib/projcore-emit-status.sh <role> <batch-id> <STATE> "<note>"
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

End your reply with `STATUS: <STATE> — <same short note>` for human/transcript readability. The pane STATUS is NOT in the detection path — projcore reads the callback file. If pane STATUS state != callback STATE, callback wins (debug-logged, not surfaced to JROM).

---

Coordinator notes:
- Your first response should be PROPOSED only. Do not modify files before APPROVED-PLAN.
- Include how you will test blocked/in-flight no-consumption without making Angular component tests brittle.
- Read these red-team files before proposing:
  - `redteam/B1-mic-silence-retry/synthesis-CR1.md`
  - `redteam/B1-mic-silence-retry/codex55-coderedteam-CR1.md`
  - `redteam/B1-mic-silence-retry/spark-coderedteam-CR1.md`
  - `redteam/B1-mic-silence-retry/grokbuild-coderedteam-CR1.md`
  - `redteam/B1-mic-silence-retry/grokcompose-coderedteam-CR1.md`
