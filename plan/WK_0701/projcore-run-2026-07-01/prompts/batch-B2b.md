<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B2b: Rung-3 full local SFU rejoin + rung-4 visible unrecovered UI (completes R2)

Batch ID: batch-B2b
Plan: plan/WK_0701/projcore-run-2026-07-01/implementation-plan.md
Branch: fix/sfu-selfheal-20260701 (commit on this branch)
Requirements assigned: R2 (completes it — the rung-3 full rejoin + rung-4 UI)
North-star anchors: #1 (escalate, never silent give-up)
Lifecycle: pre-live — Deferral policy: OFF. Read ~/.claude/JROM/style/deferral-policy.md. No TODO/FIXME/dead-code/shims. Uncertainty = STATUS: NEEDS-INFO.

Estimated duration: MEDIUM (atomic-ish) — the rejoin is one coherent mechanism. If PROPOSED sprawls >30min, propose a split (e.g. rejoin vs UI).

Effort tier (PROJCORE-PROPOSED): high
  Mode chord: /fast OFF · Claude thinking marker "think hard"
  Validator topology: 3-agent (validator=codex55) + [REDTEAM:elite] back-gate
  Why: highest-regression-risk batch — full session/PC rotation with ghost-stream/duplicate-sub/retry-storm hazards.

Context (from B2a — committed e33a98d — and B0 consensus):
B2a built the recovery coordinator + rungs 1-2 + the never-give-up low-freq continuation, and emits a
`needs-rejoin` event (via `lastRecoveryEvent` signal) + a `throttled` event, with `canRunSubscribeRecovery()`
as the gate and `recoveryEpoch`/`resetOpQueue()` as the epoch guard (already wired). THIS batch (B2b) adds
rung-3: consume `needs-rejoin` to perform ONE coalesced full local SFU rejoin, plus rung-4 visible UI.

Read the LOCKED rejoin spec: `deliberation/B0-recovery-ladder/consensus.md` §"Full SFU Rejoin Mechanism"
(the 8-step sequence) + §"Escalation Ladder" rung 3.

Requirements section (verbatim, R2 — rung-3 portion):
"Recovery can escalate from retry to renegotiation to full SFU rejoin (fresh cfSessionId) when lower-cost
recovery fails ... does NOT terminally give up while admitted and audio advertised ... Diagnostics record
each recovery step + outcome." + north-star: "The UI must clearly report unrecovered audio failure and offer
an actionable recovery. Silent failure is not acceptable."

Expected (acceptance criteria — assertable via fake-timed coordinator spec):
1. **Rung-3 full local SFU rejoin** consuming `needs-rejoin`: local SFU transport/session ROTATION (NOT
   leaving the app room / WS re-admission). Per consensus 8 steps: acquire recovery lock + bump epoch
   (resetOpQueue already does this), snapshot remotePublishers (do NOT clear roster), close old PC + clear
   local transport/subscription state, REUSE existing MediaService mic/cam/screen tracks (NO re-getUserMedia),
   create new PC + POST /api/sfu/session + publish local tracks + set fresh cfSessionId, announce fresh
   sfu-publish over WS, then subscribe to ALL advertised remote publishers (a `subscribeAllAdvertisedRemotes()`
   helper is cleaner + testable).
2. **Coalescing:** multiple pending `needs-rejoin` (N publishers advertised-not-subscribed) cause exactly ONE
   full rejoin, not N. 
3. **Throttle:** ≤1 full rejoin / 15s AND ≤2 / 2min; after that, keep the call visibly degraded + continue
   the 60s low-frequency recovery — NEVER a silent terminal stop.
4. **Epoch safety (elite-red-team surface):** the rejoin must NOT create duplicate subscriptions, ghost/orphan
   remote streams, or clobber unrelated HEALTHY remote streams; stale in-flight subscribes from before the
   rejoin must no-op (epoch guard). RemoteAudioService must remove old audio elements for rotated streams.
5. **Rung-4 visible unrecovered UI:** when throttled after repeated rejoins, surface an actionable
   "audio unrecovered — retry/rejoin" affordance (not just a console warning / latched guard) + diagnostics
   show the current rung/throttle state. This is user-visible → will need a rendered-DOM/screenshot proof.

Scope:
- Implement rung-3 rejoin + rung-4 UI for R2 only. Do NOT touch B3 (stalled audio) / B4 (publish recovery) /
  B5 (diagnostics page redesign) beyond emitting recovery events + the rung-4 affordance.
- Reuse B2a's coordinator, needs-rejoin, epoch guard, canRunSubscribeRecovery. Do NOT re-getUserMedia.
- ALL recovery tests go in the FAKE-TIMED sfu-recovery-coordinator.spec.ts harness. WRAP every test run in
  `timeout 25` — real 30s/60s timers hang the process.
- Robust polled/outcome assertions. Surgical; no unrelated refactors.

Plan handshake protocol (MANDATORY before implementation):
1. Read this brief + consensus.md §Full SFU Rejoin + the B2a coordinator code.
2. Reply PROPOSED: mechanism-level plan (how you rotate the PC/session, how you coalesce, how you avoid
   ghost/duplicate streams, how rung-4 UI surfaces) + files + risks + estimate. Confirm/counter tier.
3. End: STATUS: PROPOSED — <one-line approach> · complexity: <confirmed-or-counter> · why: <one line>.
4. Wait for APPROVED-PLAN. If REVISE-PLAN, address + re-emit.

After APPROVED-PLAN:
5. Implement at high effort ("think hard"). Emit STATUS: DONE when build + targeted tests (under timeout) green.

Required artifacts:
- batch-B2b/scenarios.md, changes.md (User Report + Root Cause + per-file WHY), review.md, test-report.md,
  screenshots/ (rung-4 UI rendered proof), independent-validation.md (validator overwrites)
- decisions/<date>-<slug>.md per §1.15 (or "Autonomous decisions: none").

---

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). The first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B2b <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```
Use WORKING only for non-terminal progress. Emit terminal/handshake state directly when you have it.

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-B2b[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: PROPOSED
