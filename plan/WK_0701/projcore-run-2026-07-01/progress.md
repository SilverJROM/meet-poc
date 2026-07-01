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

## B2a — PASS (commit e33a98d) [2026-07-01]
- 3 send-backs (mid-call, live-mid-conflict fallback, its own cap) all converged; iter3 REPRO-CLEARED-ON-LOCAL. Never-give-up class fully closed for subscribe path.
- R2 PARTIAL (same-session escalation). R2 stays IN-PROGRESS pending B2b rung-3 rejoin. /clear Sonnet+validator.
[overmind] 2026-07-01T08:21:58+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
batch-B2b dispatched_at: 2026-07-01T08:54:42Z estimate_min: 20 bucket: SHORT — Elite red-team: break the full rejoin (5 lenses)
[overmind] 2026-07-01T08:22:53+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:22:53+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:22:53+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:23:13+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:23:34+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:23:54+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:24:14+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:24:34+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:24:55+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:25:15+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:25:35+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:25:55+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:26:15+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:26:36+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:26:56+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:27:16+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:27:36+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:27:57+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:28:17+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:28:37+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:28:57+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:29:17+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:29:38+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:29:58+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:30:18+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:30:38+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:30:59+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:30:59+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11

## B2b — Rung-3 full rejoin + rung-4 UI [IN-PROGRESS 2026-07-01]
- Sonnet, high effort. PROPOSED: reuse resetForTransportRecovery()+transportRecoveryHandler (proven prod path, no new gUM/WS) + new subscribeAllAdvertisedRemotes(epoch); coalescing lock (one rejoin/N triggers); injectable-nowMs throttle ≤1/15s ≤2/2min; rung-4 banner (initialPublishFailureNotice pattern) + retry; diagnostics recoveryLadder block. Epoch/ghost-stream safety inherited from B2a + RemoteAudioService identity-diff. complexity high confirmed.
- APPROVED-PLAN with 5 elite-red-team surfaces to nail (healthy-peer resubscribe / no ghost streams / coalesce=1 / no double-PC-rotate / throttle-exhaust visible+low-freq-continues).
[overmind] 2026-07-01T08:54:45+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:54:46+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:55:06+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:55:26+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:55:46+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:56:06+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:56:27+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:56:47+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:57:07+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:57:27+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11
[overmind] 2026-07-01T08:57:28+00:00 sync OK current='Last-resort self-heal: rejoin the media session cleanly when nothing else works' tasks=11

## B2b — PASS (commit 5f4a6bf) — R2 VERIFIED [2026-07-01]
- Rung-3 full rejoin (reuse transport-recovery path) + rung-4 UI + subscribeAllAdvertisedRemotes. Elite red-team (codex55 all-lens + opus inline): 5 regression classes SAFE; rung-4 e2e screenshot real. R2 VERIFIED (B2a+B2b). /clear Sonnet+validator.
[overmind] 2026-07-01T08:58:50+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
batch-B3 dispatched_at: 2026-07-01T09:13:28Z estimate_min: 15 bucket: SHORT — Validate + std red-team stalled-audio recovery
[overmind] 2026-07-01T08:59:37+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T08:59:37+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T08:59:37+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T08:59:58+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:00:18+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:00:38+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:00:58+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:01:18+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:01:39+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:01:59+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:02:19+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:02:39+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:02:59+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:03:20+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:03:40+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:03:40+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11

## B3 — Stalled remote-audio detection [IN-PROGRESS 2026-07-01]
- Sonnet, high. PROPOSED: 2 branches in decideRemoteVoiceWatchdogAction (no-bytes-mic-on = subscribed-no-RTP; bytes-but-no-progress = playout-then-escalate), unified escalate-recovery kind → escalateStalledRemoteAudio() → B2a coordinator. Drops terminal mark-stalled. micEnabled healthy-silence guard. Per-publisher via canRunSubscribeRecovery. complexity high. APPROVED-PLAN (4 nail-points + update all mark-stalled consumers).
[overmind] 2026-07-01T09:13:31+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:13:32+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:13:32+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:13:52+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:14:12+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:14:32+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:14:53+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:15:13+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:15:33+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:15:53+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:16:13+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11
[overmind] 2026-07-01T09:16:14+00:00 sync OK current='Notice when someone's audio has silently died and fix it' tasks=11

## B3 — PASS (fc05c58) — R3 VERIFIED [2026-07-01]
- Stalled-audio detection escalates into coordinator (mic-off=clear, broken=escalate); std red-team clean. mark-stalled fully removed. Pre-existing preflight failure logged to weekly list. /clear Sonnet+validator. R1+R2+R3 done.
[overmind] 2026-07-01T09:17:02+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
batch-B4 dispatched_at: 2026-07-01T09:58:19Z estimate_min: 10 bucket: SHORT — Confirm R4b auto-recovery gap closed
[overmind] 2026-07-01T09:17:47+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:17:47+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:17:47+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:18:07+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:18:28+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:18:48+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:19:08+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:19:28+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:19:48+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:20:09+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:20:29+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:20:49+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:21:09+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:21:30+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:21:50+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:22:10+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:22:30+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:22:50+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:23:11+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:23:31+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:23:51+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:24:11+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:24:32+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:24:52+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:25:12+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:25:32+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:25:52+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:26:13+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:26:33+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:26:33+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[projcore TIER-CONFLICT batch=batch-B4 codex/sonnet=medium projcore=high resolved=high (B0-consensus participant-breaking upgrade + capped-branch wiring)]

## B4 — Publish/PC recovery [IN-PROGRESS 2026-07-01]
- Sonnet, high. PROPOSED: extract executeThrottledFullRejoin() (runFullSfuRejoin untouched), new guarded escalatePublishFailure() (healthy/publishing no-op → no clobber), wire capped-transport branch, publishRecoveryFailed signal + host-agnostic R4c notice + Rejoin button. Composition of existing primitives. APPROVED-PLAN (tier→high; 4 nail-points incl. B2a/B2b regression check).
[overmind] 2026-07-01T09:43:48+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:43:48+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:43:48+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:44:09+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:44:29+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:44:49+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:45:09+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:45:30+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:45:50+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:45:50+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11

## B4 — send-back iter1 (converging) [2026-07-01]
- Validator: all PASS except R4b — terminal initial-publish exits (room.page.ts 1802-1812, 1830-1841) set audio-failed + return without escalatePublishFailure → only manual recovery. Correction: call escalatePublishFailure at both exits. corrections/batch-B4-iter1.md.
[overmind] 2026-07-01T09:58:23+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:58:23+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:58:23+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:58:43+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:59:03+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:59:23+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11
[overmind] 2026-07-01T09:59:24+00:00 sync OK current='Recover a person whose mic never actually connected' tasks=11

## B4 — PASS (8b6825d) — R4 VERIFIED [2026-07-01]
- Publish/PC recovery (Glory case): escalatePublishFailure reuses extracted throttled rejoin, guarded (no clobber), capped-branch + terminal exits wired via markPublishAttemptFailed. std red-team clean, 1 send-back (converging). R1-R4 all VERIFIED.
- B5 routed to grok composer (mechanical diagnostics separation).
[overmind] 2026-07-01T10:00:06+00:00 sync OK current='Make the diagnostics tell the truth about what failed' tasks=11
batch-B5 dispatched_at: 2026-07-01T10:07:57Z estimate_min: 12 bucket: SHORT — Audit diagnostics honesty (grok work)
[overmind] 2026-07-01T10:00:56+00:00 sync OK current='Make the diagnostics tell the truth about what failed' tasks=11
[overmind] 2026-07-01T10:00:56+00:00 sync OK current='Make the diagnostics tell the truth about what failed' tasks=11
[overmind] 2026-07-01T10:00:56+00:00 sync OK current='Make the diagnostics tell the truth about what failed' tasks=11
[overmind] 2026-07-01T10:01:16+00:00 sync OK current='Make the diagnostics tell the truth about what failed' tasks=11
[overmind] 2026-07-01T10:01:16+00:00 sync OK current='Make the diagnostics tell the truth about what failed' tasks=11

## B5 — Diagnostics honesty [IN-PROGRESS 2026-07-01]
- grok composer, medium. PROPOSED: gate lastGumError w/ isLastGumErrorCandidate (device-only); add per-layer layerDiagnostics payload from existing signals; surface advertised-not-subscribed on diagnostics page. complexity medium. APPROVED-PLAN (no recovery changes; 406→subscribe-field test; R5c screenshot).
[overmind] 2026-07-01T10:08:00+00:00 sync OK current='Make the diagnostics tell the truth about what failed' tasks=11
[overmind] 2026-07-01T10:08:00+00:00 sync OK current='Make the diagnostics tell the truth about what failed' tasks=11
[overmind] 2026-07-01T10:08:00+00:00 sync OK current='Make the diagnostics tell the truth about what failed' tasks=11
[overmind] 2026-07-01T10:08:20+00:00 sync OK current='Make the diagnostics tell the truth about what failed' tasks=11
[overmind] 2026-07-01T10:08:40+00:00 sync OK current='Make the diagnostics tell the truth about what failed' tasks=11
[overmind] 2026-07-01T10:09:01+00:00 sync OK current='Make the diagnostics tell the truth about what failed' tasks=11
[overmind] 2026-07-01T10:09:21+00:00 sync OK current='Make the diagnostics tell the truth about what failed' tasks=11
[overmind] 2026-07-01T10:09:41+00:00 sync OK current='Make the diagnostics tell the truth about what failed' tasks=11
[overmind] 2026-07-01T10:09:41+00:00 sync OK current='Make the diagnostics tell the truth about what failed' tasks=11

## B5 — PASS (f59a38f) — R5 VERIFIED [2026-07-01]
- Diagnostics honesty (grok): 406→subscribe not lastGumError, per-layer fields, advertised-not-subscribed surfaced. codex55 audit clean, no recovery scope creep. R1-R5 ALL VERIFIED.
- B6 (local 2p+5p capstone, TEST-HEAVY) routed to Sonnet.
[overmind] 2026-07-01T10:10:51+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
batch-B6 dispatched_at: 2026-07-01T10:54:14Z estimate_min: 20 bucket: TEST-HEAVY — Re-run 2p+5p capstone; prove real recovery
[overmind] 2026-07-01T10:11:45+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:11:45+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:11:45+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:12:05+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:12:25+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:12:46+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:13:06+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:13:26+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:13:46+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:14:06+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:14:27+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:14:47+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:15:07+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:15:27+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:15:48+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:16:08+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:16:28+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:16:48+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:17:08+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:17:29+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:17:49+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:18:09+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:18:29+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:18:49+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:19:10+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:19:30+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:19:50+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:20:10+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:20:11+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11

## B6 — Multi-participant capstone [IN-PROGRESS 2026-07-01]
- Sonnet, high. PROPOSED: 2 additive test-gated infra pieces (HTTP test-only fault-inject route gated NODE_ENV!=production; 3 __meetDebug getters for recovery signals) + 2p/5p e2e scenarios asserting real recovery via diagnostics. complexity high. APPROVED-PLAN (4 nail-points: prod-disabled route, real recovery assertions, deterministic, NEEDS-INFO on real bug).
[overmind] 2026-07-01T10:54:17+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:54:18+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:54:18+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:54:38+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:54:58+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:55:18+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:55:39+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:55:59+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:56:19+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:56:39+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:56:59+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:57:20+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:57:40+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:58:00+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:58:20+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
[overmind] 2026-07-01T10:58:20+00:00 sync OK current='Prove it holds for both 2-person and 5-person calls' tasks=11
