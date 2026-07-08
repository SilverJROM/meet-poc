---
date: 2026-07-03
project: meet-poc
type: routing-override
trigger: JROM explicit custom roster request
source: projcore
priority: high
search_hooks: [custom roster, dual co-planner, mandatory deliberation every item, recurring audio bug]
---

## What was decided

JROM overrode projcore's standard model routing (§1.14) for this run
(`projcore-run-2026-07-03`, voice standardization & reliability):

1. Mandatory 3-way deliberation for EVERY item (not trigger-gated per §1.4f), roster = Codex 5.5
   (co-planner 1) + Opus (co-planner 2, dedicated session separate from the coordinator seat) +
   projcore (coordinator). Standard panel would be 4-voice (Opus+Codex5.5+Sonnet+Spark),
   triggered only on flagged/risky topics.
2. Red-team pool restricted to {sonnet, opus, codex55, spark} — no grok-build/haiku in
   red-team roles.
3. Implementer ladder: L1 = grok composer OR spark (either), L2 = grok build, L3 = sonnet.
   Matches standard tiers but explicitly allows spark as an L1-equivalent alternate.
4. Validator: codex 5.5 (matches standard).

## JROM verbatim

"for this task i want your co-planner is both codex55 and opus, you guys discuss each of the
issues/new feature one at a time and debate on how to fix it and create a plan with all 3 of
your agreeing per item, do this one at a time, you need to agree before moving forward, decide
as well w/c would be a candidate for red teaming after task implem, implementer is L1=grok
composer/spark (either), L2=grok build, L3=sonnet, validator is codex55, team is
sonnet5,opus,codex55, spark for deliberation or red team if needed based on the deliberated per
task approach."

Follow-up: "this deviates from the normal projcore as this is kind of a recurring issue on the
app and i want to fix this this time or get close to the best version of the app."

## Why coordinator-derived default didn't cover this

Standard routing (§1.14) applies a single cross-runtime co-planner + trigger-gated deliberation
(§1.4f) to conserve tokens on routine runs. This run's subject (call audio reliability) has
recurred across 4 prior runs (WK_0526 meet-remote-audio-e2e, WK_0526 meet-audio-fix, WK_0623
meet-audio-reconnect-fix, WK_0701 SFU self-heal) — JROM wants maximum planning rigor this pass
specifically because the standard cadence hasn't closed the recurring problem class.

## Reasoning

Per `trust-defaults.md`, model routing/effort/topology deviations are ALWAYS-OK when JROM states
them explicitly — this is not a product/scope decision requiring escalation, it's JROM directly
setting the routing. Logged per §1.14's explicit instruction to log any supersession of the
standard roster on first use.

## Counterfactual

Default would have been: single cross-runtime planner (opposite-runtime strongest model) for
large-plan review only, deliberation panel triggered only per §1.4f gates (not every item),
standard 4-voice roster when triggered.

## Promotion target

None proposed yet — this is scoped to this run given the "recurring issue" framing, not
proposed as a new projcore-wide default. Flag at `/jweek` if JROM finds this roster valuable
enough to want it as a standing option for future audio-pipeline runs.
