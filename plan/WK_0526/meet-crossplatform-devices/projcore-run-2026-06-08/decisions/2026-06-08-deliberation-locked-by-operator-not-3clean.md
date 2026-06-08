---
date: 2026-06-08
project: meet-poc / meet-crossplatform-devices
type: operator-override
trigger: design-convergence at R7 (doc-precision only)
source: projcore
priority: high
search_hooks: [deliberation stop rule, 3-clean override, design convergence, red-team code vs prose]
---

## Decision
Deliberation loop T1 LOCKED at R7 (design v2.2) by JROM operator decision — NOT by reaching the 3-consecutive-clean criterion. The 3-clean RED-TEAM gate is RELOCATED to the implemented CODE.

## Trigger / context
JROM set the loop bound to <=30 rounds, earliest exit = 3 consecutive red-team rounds finding nothing. R1-R6 found real blockers (22 captured: B1-B22). R7 degraded to DOC-PRECISION only (autoplay wording contradiction, B17 track-id diff, B14 pseudocode, B22 mute indicator); gpt54 stated "no remaining in-scope silent-no-banner path in Chrome"; spark stated further validation requires real code. Streak never reached 3 because prose-validation keeps generating precision nits.

## Why coordinator-derived default didn't simply continue
Continuing abstract-design rounds risks polishing prose indefinitely while the REAL bug surface (code) stays untested — the exact failure mode of the prior FIX1-5 (passed prose review, failed live). So projcore surfaced the methodology fork to JROM rather than auto-continue.

## Operator decided (verbatim choice)
"Implement v2.2, then red-team the CODE." (AskUserQuestion, 2026-06-08)

## Reasoning / counterfactual
Counterfactual = keep running design rounds to literal 3-clean. JROM chose to apply the 3-clean gate to the implemented diff instead (higher signal). Honors his "don't ship maybe-broken" intent by putting the rigorous gate where it catches real defects.

## Generalization candidate
When a deliberation converges to doc-precision-only (severity of findings monotonically decreasing, last round no new failure mode), the 3-clean gate is more valuable on the implementation than on the spec. Candidate projcore rule: "design-convergence detector → relocate the clean-streak gate to code."
