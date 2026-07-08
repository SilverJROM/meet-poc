# Red-team candidates

Per this run's custom roster: each item's redteam-candidate decision is made DURING that item's
deliberation (not pre-selected by projcore alone at Phase 0). Pool restricted to
{sonnet, opus, codex55, spark} (no grok-build/haiku in red-team roles this run).

| Item | Candidate? | Tier | Reasoning | Decided in |
|---|---|---|---|---|
| T1 / B1 (R1 mic-silence retry) | YES | standard (sonnet+spark+codex55+opus, substituting spark for haiku) | Retry-storm risk (I/O-unbounded getUserMedia re-acquisition), rewrites a load-bearing pure reducer, touches 3 existing recovery paths — double-recovery/regression risk is real | `deliberation/T1-mic-silence-retry/consensus.md` |
