# Progress — Voice SFU Self-Heal (WK_0701)

[projcore SESSION-PREFIX 01]

[projcore LINEUP]
- Coordinator: opus (projcore)
- B0 co-planner (cross-runtime §2a): codex55  (per JROM: coordinator is opus, so co-planner ≠ opus)
- Implementer L1 (default): grok composer (grok-composer-2.5-fast)
- Implementer L2 (backup): grok build (grok-build)
- Implementer (complex): sonnet
- Validator: codex55 (own session)
- Topology: 3-agent (validator ≠ implementer ≠ coordinator) — whole run
- Test-clients (validation only): grok-build @ dev_machine · grok @ Peer2's · JROM-local
- Red-team tiers: B2 elite · B3 standard · B6 standard

## 2026-07-01 — Phase 0 setup
- Branch-audit gate: `main` (e9aedff) already merged 46/47 branches; `b8-mesh-retire-wip`
  is stale (2026-05-22, reverts a month of work) → NOT merged. See decisions/2026-07-01-baseline-and-wip.md.
- Uncommitted SFU WIP preserved (prior-art/uncommitted-resubscribe-attempt.patch + stash@{0});
  branch `fix/sfu-selfheal-20260701` created clean off e9aedff.
- Artifacts written: og-requirements.md, implementation-plan.md, north-star.md, queue.md,
  req-matrix.md, deliberation/candidates.md, redteam/redteam-candidates.md.
- Effort Policy derived (north-star): high-skewed (realtime media/concurrency/external SFU), posture A.

## Batch log
(dispatched_at lines land here via projcore-dispatch.sh --summary)
[overmind] 2026-07-01T05:51:17+00:00 register OK run_dir=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01 wf=111
[overmind] 2026-07-01T05:52:34+00:00 child sync OK (child-add 01_planner_codex55_meetpoc:planner) children=["01_planner_codex55_meetpoc"]
[overmind] 2026-07-01T05:52:42+00:00 sync OK current='' tasks=0
[overmind] 2026-07-01T05:53:37+00:00 sync OK current='Agree the exact recovery strategy so the fix is final, not guesswork' tasks=10

## B0 — Recovery-ladder deliberation [DONE 2026-07-01]
- codex55 co-planner verdict (deliberation/B0-recovery-ladder/codex55-verdict.md, 12KB) → Opus APPROVED-PLAN.
- Agreed: 4-rung escalation ladder + recovery coordinator + epoch guard (consensus.md).
- Prior-art WIP resolved: keep micEnabled guard + teardown cleanup insight; drop terminal same-session resubscribe + capped mark-stalled.
- Plan adjusted: B4 medium→high +REDTEAM:standard; B1 +stale-in-flight case; B3 on B2 coordinator; B6 +5-person coalescing.
- Assignments final: DELIB B0+B2 · REDTEAM elite B2 · standard B3+B4+B6.
- [projcore ACK] planner B0 RECEIVED PROPOSED 2026-07-01
[overmind] 2026-07-01T06:00:59+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10
[overmind] 2026-07-01T06:01:31+00:00 child sync OK (child-add 01_impl_grokcompose_meetpoc:implementer) children=["01_planner_codex55_meetpoc", "01_impl_grokcompose_meetpoc"]
batch-B1 dispatched_at: 2026-07-01T06:03:57Z estimate_min: 30 bucket: MEDIUM — Reliably recreate the "can't hear each other" failure on demand
[overmind] 2026-07-01T06:04:01+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10
[overmind] 2026-07-01T06:04:01+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10
[overmind] 2026-07-01T06:04:01+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10
[overmind] 2026-07-01T06:04:21+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10
[overmind] 2026-07-01T06:04:21+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10

## B1 — Reproduction harness [IN-PROGRESS 2026-07-01]
- Dispatched to grok composer (01_impl_grokcompose_meetpoc), watcher pid 2441966, failsafe wakeup 3600s acked.
- PROPOSED: env-gated backend 406 injection + failing BUG-REPRO tests (subscribe-cap, stall-latch, epoch-guard, 406 evidence). complexity high confirmed (no tier conflict).
- APPROVED-PLAN sent (emphasized: honest failing tests, assert give-up OUTCOME, codex55 will audit repro validity).
[overmind] 2026-07-01T06:06:38+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10
[overmind] 2026-07-01T06:13:36+00:00 child sync OK (child-add 01_validator_codex55_meetpoc:validator) children=["01_planner_codex55_meetpoc", "01_impl_grokcompose_meetpoc", "01_validator_codex55_meetpoc"]
batch-B1-validate dispatched_at: 2026-07-01T06:15:09Z estimate_min: 15 bucket: SHORT — Independently audit the reproduction harness is honest
[overmind] 2026-07-01T06:15:12+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10
[overmind] 2026-07-01T06:15:12+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10
[overmind] 2026-07-01T06:15:12+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10
[overmind] 2026-07-01T06:15:32+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10
[overmind] 2026-07-01T06:15:53+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10
[overmind] 2026-07-01T06:16:13+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10
[overmind] 2026-07-01T06:16:33+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10
[overmind] 2026-07-01T06:16:53+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10
[overmind] 2026-07-01T06:17:13+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10
[overmind] 2026-07-01T06:17:34+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10
[overmind] 2026-07-01T06:17:54+00:00 sync OK current='Reliably recreate the "can't hear each other" failure on demand' tasks=10

## B1 — Reproduction harness [PASS 2026-07-01]
- grok composer implemented (commit 6643a02); codex55 independent audit REPRO-CONFIRMED (R1 a-d), hidden-fix audit PASS.
- Deterministic gates: backend vitest 5/5, frontend build PASS, repro specs honest give-up (projcore re-verified).
- R1 → VERIFIED. Context hygiene: /clear grok + validator. Pre-existing room-decisions.spec L400 fail noted (out of scope).
- Routing: B2/B3/B4 → Sonnet (correctness-critical, decisions/2026-07-01-b2-routing.md); B5 → grok.
[overmind] 2026-07-01T06:57:54+00:00 sync OK current='Stop the app giving up: keep healing until people can hear each other' tasks=10
[overmind] 2026-07-01T06:58:29+00:00 child sync OK (child-add 01_impl_sonnet_meetpoc:implementer) children=["01_planner_codex55_meetpoc", "01_impl_grokcompose_meetpoc", "01_validator_codex55_meetpoc", "01_impl_sonnet_meetpoc"]
batch-B2a dispatched_at: 2026-07-01T08:19:28Z estimate_min: 12 bucket: SHORT — Final: confirm never-give-up class fully closed
[overmind] 2026-07-01T06:59:46+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T06:59:47+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T06:59:47+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:00:07+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:00:27+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:00:47+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:01:07+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:01:28+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:01:48+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:02:08+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:02:28+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:02:49+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:03:09+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:03:29+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:03:49+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:04:09+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:04:30+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:04:50+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:05:10+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:05:30+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:05:51+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:06:11+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:06:31+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:06:51+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:06:51+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11

## B2a — Coordinator + epoch guard + rungs 1-2 [IN-PROGRESS 2026-07-01]
- Sonnet (01_impl_sonnet_meetpoc), high effort. PROPOSED (7m analysis): reuse subscribeIfNeeded/doSubscribeTracks choke points; epoch via resetOpQueue generation; rung split (cap3 250/500/1000 + cap2 renegotiate 500/1000); rung-2 exhaust → low-freq 30s continuation (no latch) + needs-rejoin marker; epoch guard via B1 shouldBindSubscribeResponse @~L1889.
- Scope decision APPROVED: mid-call/live-mid-conflict paths keep existing logic for B2a (epoch guard only); full convergence + rejoin = B2b. complexity high confirmed.
- APPROVED-PLAN sent with no-terminal-give-up invariant emphasis.
[overmind] 2026-07-01T07:08:56+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:30:45+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:30:45+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:30:45+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:31:05+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:31:26+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:31:46+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:32:06+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:32:26+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:32:46+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:33:07+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:33:27+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:33:47+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:34:07+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:34:27+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:34:48+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:35:08+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:35:28+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T07:35:28+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11

## B2a — send-back iter 1 [2026-07-01]
- Validator codex55: REPRO-STILL-PRESENT. Coordinator/epoch-guard/rungs/bounds/tests all PASS; ONE gap: mid-call subscribe path (scheduleMidCallSubscribeRetry ~L1500) still terminally "permanently stopped" instead of escalating.
- Coordinator reversed earlier scope-deferral approval (mid-call give-up violates never-give-up north-star; real HRIS_TOJ unmute scenario). Correction: corrections/batch-B2a-iter1.md sent to Sonnet.
- Rung-1 (of §1.16 ladder) normal iteration.

## B2a iter1 — STUCK intervention [2026-07-01]
- Sonnet hung ~13min on sfu-client.spec.ts: mid-call never-give-up test ran REAL 30s low-freq timers that re-arm forever → process never exits. Killed hung test tree (pids 2492080+).
- Redirect (§1.10b bounded, ONE change): use fake-timer harness (like sfu-recovery-coordinator.spec.ts) so the mid-call escalation test terminates; do not wait real 30s. NOT a prod bug — re-arm-forever is desired prod behavior.

## B2a iter1 — redirect 2 (test-harness) [2026-07-01]
- Sonnet burned ~25min fighting whole-file sfu-client.spec.ts real-timer hang. Bounded redirect (option B): delete obsolete terminal-stop assertions in sfu-client.spec.ts; put mid-call never-give-up assertion in the fake-timered coordinator spec; wrap runs in `timeout 20`. Production fix intact.
[overmind] 2026-07-01T08:09:41+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T08:09:41+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T08:09:41+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T08:10:01+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T08:10:21+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T08:10:42+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T08:11:02+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T08:11:22+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T08:11:22+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11

## B2a — send-back iter 2 (converging) [2026-07-01]
- Validator iter2: mid-call gap CLEARED; one terminal path remains — live-mid-conflict fallback (line 512-525) caps via nextSubscribeRetry(416) leaving latched guard. CONVERGING (narrower, evident progress).
- Correction: route that fallback cap-exhaust into low-freq continuation (nextSubscribeRetry sole caller = line 525, closes the primitive). corrections/batch-B2a-iter2.md.
[overmind] 2026-07-01T08:19:31+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T08:19:31+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T08:19:31+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T08:19:52+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T08:20:12+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T08:20:32+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T08:20:52+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
[overmind] 2026-07-01T08:20:52+00:00 sync OK current='Stop giving up after retries: escalate to renegotiate instead of quitting' tasks=11
