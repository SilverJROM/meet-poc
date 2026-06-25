---
date: 2026-06-25
type: autonomous-call
source: projcore
trigger: grok monthly limit at 8% at spin-up
---
JROM directed "lean heavily on codex55 and grok". At spin-up grok showed "Monthly limit left: 8%".
Per §1.20 usage-aware degrade: grok is assigned ONLY the mechanical B1 deploy (single `ng build`),
its lightest possible task. All heavier frontend/backend/diagnosis work routes to codex55; sonnet validates.
Still honors "lean on grok" for the cheap task while respecting the near-depleted bucket.
Counterfactual: full grok implementer load would likely exhaust mid-run and strand a batch.
