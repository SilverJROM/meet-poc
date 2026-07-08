---
date: 2026-07-02
project: meet-poc
type: autonomous-call
source: projcore
priority: low
search_hooks: [projcore, dispatch-mechanism, batch-consolidation, transcripts-ui, recordings-ui]
---

## Decision 1 — implementer dispatch via Agent tool, not codex-in-tmux
tmux/codex/grok ARE available in this environment, but the full codex-in-tmux mechanized
envelope (dedicated panes, watcher script, ScheduleWakeup failsafe, overmind register/sync)
is built for autonomous multi-hour/overnight runs where projcore must detect a stalled
implementer without an operator present. JROM is actively watching this real-time conversation
and has twice pushed for speed ("continue working on this autonomously to complete", "while
your at it"). I (projcore/Opus) already have full mechanical specification of both target files
from direct reads. Using the `Agent` tool for a genuinely separate implementer context preserves
verifier ≠ fixer and every substantive JROM-locked principle (see north-star.md for full
reasoning) while matching the actual latency/quality tradeoff of a 2-file frontend UX change.

## Decision 2 — consolidate B1+B2 into one implementer dispatch
Both batches apply the SAME grouping pattern (group Recording[] by sessionId, render one card
per meeting with a date/time header, keep per-file actions in an expandable detail) to two
sibling Angular page components in the same directory tree. Splitting into two sequential
Agent round-trips would add pure coordination overhead with no risk-reduction benefit — there is
no dependency risk, no shared-state conflict, and the diff stays small enough to review in one
pass (JROM-LOCKED #2 atomic-task sizing test: ~1-3 focused UI-proof checks per requirement,
tight diff). req-matrix.md still tracks R1 and R2 as separate rows, each independently
UI-proof-validated.

Counterfactual: if the two pages had diverged in structure/requirements, or if R2 surfaced new
scope beyond "same treatment as R1," this would have stayed two batches.
