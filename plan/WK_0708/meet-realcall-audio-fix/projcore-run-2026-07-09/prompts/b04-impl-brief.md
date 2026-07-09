# Batch B04 — Implementer L2 haiku

Title: Baseline two-call T_gap derivation
Plan: Run first two instrumented 3–5 min .140 <-> .123 calls, compute audible-gap distribution from recordings/transcripts, write T_gap decision entry before recovery ACs gate on it.

## §4b
impl L2 · val L2 · delib no · redteam budget

## Scope
- Wire B03 scheduler + B02 arbiter into an instrumented dual-endpoint (or dry-run scaffolding if machines unavailable)
- Run/simulate two baseline calls, burn 2/25 on real burns only
- Derive T_gap from gap histogram; write decisions/T_gap.md with justification
- Acceptance: decision file records T_gap, histogram/source paths, call burn 2/25, rationale. Recording/transcript drives value not stats.

## Env
dev_machine 192.168.254.123 (wake if needed: python3 /home/agjrom/websites/local_dev/wake-123.py). Guide: local_dev/dev_machine.md. Do not reinstall.

## Handshake
Write prompts/b04-proposed.md with STATUS: PROPOSED. If full live dual-call is blocked by env, propose minimal scaffold that still produces a justified T_gap from measured harness gaps (honest scope) and list what requires live later. Wait APPROVED-PLAN.
