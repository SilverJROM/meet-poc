---
date: 2026-07-03
project: meet-poc
type: autonomous-call
trigger: JROM said "godspeed" without picking explicitly between full-upfront-planning vs JIT-interleaved deliberation sequencing
source: projcore
priority: medium
search_hooks: [deliberation sequencing, JIT vs upfront planning, one item at a time]
---

## What was decided

Deliberation-vs-implementation sequencing for the custom per-item roster (see sibling decision
`2026-07-03-custom-roster-supersession.md`): **JIT-interleaved, one item at a time** —
deliberate item N (codex55 + Opus-planner + coordinator reach agreement + redteam-candidate
flag) -> dispatch item N's implementer -> gate -> THEN deliberate item N+1. Not: deliberate all
7 items up front before any implementation starts.

## Why coordinator-derived default didn't cover this

JROM's instruction ("do this one at a time, you need to agree before moving forward") is
ambiguous between (a) resolving each item's plan before moving to the next item's PLANNING, or
(b) resolving each item's plan before moving to that item's IMPLEMENTATION, then the whole
next-item cycle. I asked this as an explicit clarifying question; JROM replied "godspeed" +
greenlight without picking one, deferring the call to me.

## Reasoning

Read (b) — JIT-interleaved — as the more literal match to "agree before moving forward"
(moving forward = starting to build that item), and it preserves projcore's normal one-batch-
at-a-time discipline (§1.3 rule 7) and keeps priority-ordered reliability fixes (R1-R4) landing
soonest rather than waiting on a full 7-item planning pass first.

## Counterfactual

Full-upfront-planning: deliberate all 7 items to consensus first, producing a complete
implementation-plan.md, THEN dispatch implementation in priority order. Rejected because it
disconnects later items' (e.g. R5 balancer) planning from real implementation feedback surfaced
by earlier items (e.g. R1's mic-energy.ts changes), and delays landing the reliability-first
fixes JROM explicitly prioritized.

## Promotion target

None — this is a one-off interpretation call for this run's ambiguous instruction, not a
generalizable rule.
