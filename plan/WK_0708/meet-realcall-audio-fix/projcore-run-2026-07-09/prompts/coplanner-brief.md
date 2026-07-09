# Co-planner brief — projcore-run-2026-07-09 (SUB-MODE planning)

You are ONE of TWO co-planners (opus + codex55). You co-own the north-star with your peer.
You do NOT implement code. You deliberate and produce planning artifacts.

## Read first (in order)
1. /home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09/briefing-packet.md
2. .../north-star.md
3. .../og-requirements.md  ← Q0 anchor; ACs AC1–AC14 already authored — refine only if needed, do not gut
4. .../decisions/2026-07-09-harness-team-and-scope.md (D14–D26)
5. .../topology.yaml
6. Prior run (context only, DO NOT RESUME): ../projcore-run-2026-07-08/ — its b01-diagnosis.md misattributes root cause

## Mission
Atomic vertical-slice plan for a fully automated fix→test loop .140 ↔ .123 that hardens the voice stack
and leaves the app READY FOR JROM'S REAL-CALL TEST. Bounded exit: (clean 3–5min call AND clean 10-min gate)
OR 25-call budget exhausted → STOP.

## Produce these files in the run_dir
- plan.md — ATOMIC batches only:
  - each non-test batch <30 min non-test work
  - ~1–3 tests, tight diff, 95/5 rule
  - EVERY batch row MUST annotate:
    impl_tier: L1|L2|L3
    validator_tier: L1|L2|L3
    deliberation: yes|no
    redteam: yes|no (budget|standard|elite)
- Optionally refine og-requirements.md only if a gap blocks atomic planning (do not rewrite the problem)

## Topology mapping (from topology.yaml — do not invent models)
- impl L1: A/B alternate spark ↔ grokcompose (start spark); L2 haiku; L3 sonnet
- val L1/L2 codex55 (backup sonnet — note when used); L3 opus
- Capture-path batches (gUM shim, AudioParam ramp, mic-energy, remote-audio.service):
  MUST be tagged deliberation: yes, redteam: standard (or yes (standard)), impl_tier: L3
- Default elsewhere: impl L2, validator L2, redteam budget or no, deliberation no
- Conserve: codex55 ~4% headroom — ration validators; redteam elite ONLY after fix fails twice

## Hard constraints (non-negotiable)
- Recording is the arbiter; stats never decide alone
- INVALID is third verdict ≠ PASS
- Harness must not manufacture failures (fixed clock speech; LLM async)
- Do NOT slow the ease-in ramp (fix discontinuity via AudioParam, not duration)
- Verifier ≠ fixer at every tier (sonnet-impl never sonnet-validate)
- No merge to main; fix locally; SG confirmation-only
- Never delete session 652c1475 or room TEST_ROOM01; no wildcard sweeps
- Env already provisioned on .123 — do not reinstall
- Branch: batch-01-diagnosis-2026-07-08

## Coordination protocol
1. Read docs. Propose structure.
2. Deliberate with peer: write/update plan.md in the run_dir (both may edit; converge on one plan).
3. When you believe plan is ready for structural custody, emit EXACTLY:
   [projcore callback] coplanner <your-model> STATUS: PROPOSED — plan.md ready for structural check; batches=N
4. Then wait. Do not start implementation.
5. If blocked: [projcore callback] coplanner <your-model> STATUS: BLOCKED — <reason>

## Deliverable shape for plan.md
Use a clear numbered batch table/list. Each batch: id, title, scope (files/mech), acceptance (recording/transcript proof), est_min, impl_tier, validator_tier, deliberation, redteam, depends_on.

Tag harness/infra batches first if needed so later ACs can run. Include T_gap derivation batch early (D14). Include budget tracking.

Start now. Co-own with your peer. Converge into ONE atomic plan.md.
