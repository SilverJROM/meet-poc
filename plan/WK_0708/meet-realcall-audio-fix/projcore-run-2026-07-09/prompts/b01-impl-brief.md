# Batch B01 — Implementer (L2 haiku)

Batch ID: B01
Title: Call-budget ledger and cleanup guardrails
Plan: /home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09/plan.md
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09
Branch: batch-01-diagnosis-2026-07-08 (do NOT merge to main)
North-star: recording is arbiter; harness must not manufacture failures; protected ids never deleted

## §4b (map to topology.yaml)
- impl_tier: L2 (you: haiku)
- validator_tier: L2 (codex55 after you)
- deliberation: no
- redteam: yes (budget) — after your DONE, a budget red-team may run before validator

## Scope (ONLY this)
Add the run-owned:
1. **Call budget ledger** (25-call burn + 5-gate cap tracking)
2. **Created-ID registry** (rooms/sessions captured at creation)
3. **Delete guard** that can ONLY delete IDs captured by THIS run
4. Hard-block protected IDs: session `652c1475`, room `TEST_ROOM01`, `testroom01001` — never delete, no wildcards

Suggested location (pick sensible existing harness/scripts area under repo; prefer e2e/scripts or a new small module under plan run dir / scripts for harness state):
- Prefer co-locating under `e2e/` or `scripts/harness/` so later batches reuse it
- Must be importable by later Playwright/orchestrator batches

## Acceptance for B01 (no AC closes yet)
- Dry-run proves protected IDs cannot be deleted
- Dry-run proves uncaptured IDs are rejected
- Unit/smoke tests ~1-3 covering: protect block, uncaptured reject, allow registered id path (can mock delete)
- Write `changes.md` Codex-style for this batch under run_dir/validation or batch-artifacts

## Handshake (MANDATORY)
First output MUST be PROPOSED:
- 2-4 line mechanism/approach
- Planned files + why
- Risks
- Estimate confirm (minutes)
Then STOP and wait for: APPROVED-PLAN from projcore

After APPROVED-PLAN: implement, atomic commits on current branch, emit:
[projcore callback] impl B01 STATUS: DONE — <note>
or BLOCKED / NEEDS-INFO

## Rules
- Atomic vertical slice only; <30 min; tight diff; 95/5
- Execute ONLY B01 gaps — do not start B02+
- Pre-live deferral OFF
- Verifier ≠ fixer (you do not self-validate as gate)
- Never touch protected historical diagnostics
- Do not reinstall env; do not touch 139.180.129.185
- FE changes need ng build if any (this batch likely pure harness/scripts)

Start with PROPOSED now.
