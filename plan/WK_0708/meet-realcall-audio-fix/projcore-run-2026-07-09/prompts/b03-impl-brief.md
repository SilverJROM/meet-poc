# Batch B03 — Implementer (L2 haiku)

Batch ID: B03
Title: Fixed-clock conversation harness
Plan row B03: Pre-generate piper speech assets; schedule both bots on a fixed clock; run llama/LLM replies asynchronously so brain latency never gates speech.

## §4b
impl_tier: L2 (haiku) · validator_tier: L2 (codex55) · deliberation: no · redteam: yes (budget)

## Scope ONLY
- Fixed-clock speech scheduler (not LLM-gated)
- Pre-generated audio assets (piper or synthetic WAV placeholders acceptable if piper env not used yet)
- Async brain path that never blocks/silences the clock
- Hooks for later .140/.123 loop; reuse e2e/harness/

## Acceptance
Local harness run records both sides speaking fixed utterances; transcript/or analysis proves expected words/timings were emitted even if async brain is late.

## Non-negotiables
Harness must not manufacture failures: speech on fixed clock from pre-generated audio; LLM async.
B02 arbiter available for analysis.

## Handshake
First STATUS: PROPOSED → wait APPROVED-PLAN → implement → vitest/unit tests → commit → [projcore callback] impl B03 STATUS: DONE

Write prompts/b03-proposed.md AND wait for APPROVED-PLAN.
