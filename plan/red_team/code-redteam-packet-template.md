# TEMPLATE — code-redteam-packet-CR{k}.md
# Fill {placeholders}. Keep it LEAN (≤ ~40 lines). One lens per round.

# CODE RED-TEAM — round CR{k} — lens L{k}: {lens name, e.g. "concurrency / leaks / scenario traces"}
# (Your role = the model you run as: opus | codex55 | gpt54 | spark | sonnet | haiku.)

## Context
{1-2 lines: what prior rounds found + fixed. Streak is {s}/3; we need 3 CONSECUTIVE clean over DIFFERENT lenses.}
This round attacks a DISTINCT surface from prior rounds — do NOT repeat earlier checks. A clean round only
counts if you genuinely tried to break it with THIS lens and found nothing.

## Read
- The REAL files on disk: {list the changed prod files}
- The unified diff: {path}/IMPL-prod-diff.patch
- The contract/design: {path}/consensus-*.md ; the root cause: {path}/jrom-evidence-addendum.md

## The bar (requirement)
{1-3 lines: the user-facing behavior that must hold. e.g. "host hears every remote talker on the SELECTED
output device, all concurrent, never suppressed; no silent-with-no-banner state."}

## Your task — lens L{k}: {one paragraph aiming the panel at THIS surface}
{Enumerate 4-6 concrete attack questions for this lens, each demanding evidence at file:line. Examples:}
1. {race}: {specific interleaving to trace}
2. {leak}: {specific maps/elements/listeners to audit over a long call}
3. {scenario}: walk THE exact user failure through the code; name the first step it breaks.
4. {edge}: {garbage inputs / platform quirk to probe}
5. Anything prior rounds + the coordinator missed.

## Output — write `{path}/{role}-coderedteam-CR{k}.md`:
```
# {role} CODE red-team CR{k} (lens L{k})
## {lens} findings (or none) — evidence file:line
## NEW bugs (table: severity | file:line | what breaks | fix) or "none"
## {scenario} trace: first failing step (or "holds throughout")
STATUS: CLEAN — no real bug under this lens   OR   STATUS: BUGS — <one-line worst>
```
Ruthless + honest. Different lens than prior rounds. Say CLEAN only if you truly found nothing.

---
## Streak table format (track in progress.md)
| Round | Lens | Verdicts (n CLEAN / n BUGS) | New bugs? | Streak | State |
|-------|------|------------------------------|-----------|--------|-------|
| CR1 | L1 structural | ... | YES/NO | 0–3 | CLEAN / CR-fix-k dispatched |
Rule: streak += 1 only if the round used a NEW lens AND all panelists CLEAN. ANY bug → streak = 0.
Gate passes at streak == 3 (achieved over 3 DIFFERENT lenses).
