<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B2a: Recovery coordinator + epoch guard + rungs 1-2 (kill the permanent-stop cap)

Batch ID: batch-B2a
Plan: plan/WK_0701/projcore-run-2026-07-01/implementation-plan.md
Branch: fix/sfu-selfheal-20260701 (commit on this branch)
Requirements assigned: R2 (partial — same-session escalation; full rejoin is B2b)
North-star anchors: #1 (escalate, never silent give-up)
Lifecycle: pre-live — Deferral policy: OFF. Read ~/.claude/JROM/style/deferral-policy.md. Under OFF: no TODO/FIXME, no "follow-up PR," no dead-code shims. Leaving a seam for B2b (rung-3 rejoin) is LEGAL intra-run sequencing because B2b is a queued task landing THIS run — but you must NOT reintroduce a terminal give-up. Uncertainty = STATUS: NEEDS-INFO, not a defer.

Estimated duration: SHORT/MEDIUM (atomic slice) — ~1-3 focused service/reducer tests, tight diff. If PROPOSED is bigger, propose a further split.

Effort tier (PROJCORE-PROPOSED): high
  Mode chord: /fast OFF · Claude thinking marker "think hard"
  Validator topology: 3-agent (validator=codex55)
  Why: live SFU recovery coordinator + concurrency/epoch guard (effort-tiering high trigger: real-time/concurrency).

Context (from B0 consensus — the approach is LOCKED, do not relitigate):
Read `deliberation/B0-recovery-ladder/consensus.md` in full. The agreed design is a 4-rung escalation
ladder inside ONE recovery coordinator keyed by {recovery-epoch, publisherClientId}, all PC-mutating work
through enqueue(), coalescing duplicate triggers, emitting a diagnostics event per rung. THIS BATCH (B2a)
delivers the coordinator + epoch guard + rungs 1-2 ONLY. Rung 3 (full local SFU rejoin) + rung 4 (visible
UI) are B2b (next batch, [REDTEAM:elite]).

The defect (from B1, reproduced): frontend/src/app/services/sfu-client.service.ts ~L258 permanently stops
subscribe retry ("guard stays set until cfSessionId changes"). B1 built the repro harness
(sfu-repro-harness.spec.ts) + an INERT epoch predicate (sfu-recovery-epoch.ts `shouldBindSubscribeResponse`)
+ 406 evidence instrumentation (lastSubscribeFailureEvidence). REUSE these — do not rebuild.

Requirements section (verbatim, R2):
"When /api/sfu/tracks fails or a remote track stays advertised-not-subscribed, the app recovers and does
NOT terminally give up while the user is admitted and audio is advertised. The permanent-stop cap escalates
retry → renegotiate → full SFU rejoin (fresh cfSessionId) instead of terminal give-up. Diagnostics record
each recovery step + outcome." (B2a = retry → renegotiate portion; rejoin is B2b.)

Expected (acceptance criteria — assertable):
1. **Recovery coordinator** in SfuClientService keyed by {epoch, publisherClientId}: coalesces duplicate
   triggers, runs all PC-mutating work via enqueue(), emits per-rung diagnostics events (`subscribe-retry`,
   `subscribe-renegotiate`). Fires ONLY while: admitted+session+participant · local publish 'published' ·
   publisher in remotePublishers · publisher advertises ≥1 audio track · peer.micEnabled !== false.
2. **Rung 1 — same-session subscribe retry:** clear that publisher's sub state, re-run doSubscribeTracks for
   missing advertised tracks. Bound 3 attempts per {publisher,pubCfSid,localCfSid,epoch}, backoff 250/500/1000ms + jitter.
3. **Rung 2 — forced renegotiated subscribe:** doSubscribeTracks(pub, missing, {forceRenegotiation:true})
   after clearing sub state. Bound 2 attempts, backoff 500/1000ms.
4. **NO terminal give-up:** the permanent-stop cap at ~L258 is REPLACED. When rung-2 attempts exhaust
   (pending B2b's rejoin), continue a bounded LOW-FREQUENCY same-session retry (e.g. every 30-60s) while
   admitted + advertised — do NOT latch a permanent stop. Emit a `needs-rejoin`/`throttled` diagnostics
   marker B2b will consume. (This preserves the never-give-up invariant before B2b lands.)
5. **Epoch guard wired:** every async subscribe path captures the recovery epoch and no-ops its bind if the
   epoch changed (use/adapt sfu-recovery-epoch.ts shouldBindSubscribeResponse). Prevents stale in-flight binds.
6. **B1 repro tests updated to assert escalation** (they previously asserted the give-up): the cap-give-up
   characterization tests now assert rung1→rung2 escalation + no permanent stop. Add focused tests for the
   coordinator + epoch guard.

Scope:
- Implement ONLY the coordinator + epoch guard + rungs 1-2 for R2. Do NOT implement rung-3 full rejoin (B2b).
- Do NOT touch B3 (stalled-audio watchdog) or B5 (diagnostics page) beyond emitting the recovery events.
- Reuse B1's sfu-recovery-epoch.ts + lastSubscribeFailureEvidence. Wire the epoch predicate into the live path.
- No duplicate subscriptions / ghost streams: keep isTrackSubscribed()/subscribedClientIds gating; add epoch checks after each awaited HTTP/SDP step.
- Robust polled assertions; assert the OUTCOME (escalation occurred / no permanent stop), not just that a call fired.
- Surgical. No "while I'm in here" refactors.

Plan handshake protocol (MANDATORY before implementation):
1. Read this brief + consensus.md + the referenced files.
2. Reply PROPOSED: mechanism-level plan + files + risks + estimate. Confirm/counter the tier.
3. End reply: STATUS: PROPOSED — <one-line approach> · complexity: <confirmed-or-counter> · why: <one line>.
4. Wait for APPROVED-PLAN before writing code. If REVISE-PLAN, address + re-emit PROPOSED.

After APPROVED-PLAN:
5. Implement at high effort ("think hard"). Emit STATUS: DONE when build + targeted tests green.

Required artifacts:
- batch-B2a/scenarios.md, changes.md (User Report verbatim + Root Cause + per-file WHY), review.md,
  test-report.md, independent-validation.md (validator overwrites), screenshots/ (if UI-observable)
- decisions/<date>-<slug>.md per §1.15 (or "Autonomous decisions: none").

---

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). Not the first sentence — the first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B2a <STATE> "<note>"
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
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-B2a[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: PROPOSED
