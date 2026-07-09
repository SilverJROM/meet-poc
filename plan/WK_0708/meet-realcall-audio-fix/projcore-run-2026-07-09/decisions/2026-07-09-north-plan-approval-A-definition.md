---
source: north
date: 2026-07-09
effort: meet-realcall-audio-fix
run: projcore-run-2026-07-09
priority: high
search_hooks: [A definition, 2-party no-op, B08 B09, loudest remote, reference loudness]
---

# North plan approval + binding corrections (2026-07-09)

## Planning panel
**ANSWER: NO.** Do not convene planning-stage deliberation panel. 2 co-planners only (D24 conserve).
Deliberation panel is **per-batch** on capture-path only (gUM shim, AudioParam ramp, mic-energy, remote-audio.service).

## Plan status
**APPROVED** with three binding corrections below. Co-planner 2-party finding verified by /north numerically:
- 1 remote publisher → loudest==that peer → raw=max(1,0.88)=1.0 unity at any level
- 3-party: quiet 0.02 / loud 0.40 → gain 2.499 → A=0.125; A=min(2.5r,0.88) so A≥0.75 needs r≥0.30
- BOTH defects real; B09 must address both without regressing ≥3-party

## Binding correction 1 — define A explicitly
In 2-party the app's internal "loudest remote" is degenerate → A must NOT be measured against it.

**A = loudness(quiet speaker heard at far end) / loudness(THE SAME speaker at normal level, heard at the same far end, same path)**

- Voiced segments only, RMS/LUFS
- Same speaker, same path, normal-vs-attenuated
- Record the normal-level reference pass **BEFORE** the sweep

## Binding correction 2 — B08 headline
B08 must report the 2-party unity result as its **HEADLINE** finding with gain-trace evidence, not a footnote.
- Expect **A ~= r** at every sweep point pre-fix (no boost)
- If boost is observed in 2-party → **REFUTES** the finding — say so loudly

## Binding correction 3 — B09 reference
B09 must pick a **NON-DEGENERATE** reference:
- absolute target loudness, **or**
- the local publisher's own level
- **NOT** "loudest remote"
- Guard ≥3-party with a test so fix does not regress it
- Compressor remains limiter **backstop**, never the proof

Everything else in plan.md stands.
