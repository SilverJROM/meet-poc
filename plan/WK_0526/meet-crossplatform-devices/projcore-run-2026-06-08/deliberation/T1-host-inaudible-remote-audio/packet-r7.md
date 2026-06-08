# DELIBERATION T1 — host-inaudible-remote-audio — ROUND 7 (final completeness gate)
# (Your role = the model you run as.)

## 0. READ FIRST (this dir)
- `consensus-r4-registry.md` — the FULL design, now including "R5 additions (v2)" + "R6 additions (v2.1)". B1-B20 + the ordered addPublisher sequence + wiring (B17) + timeouts (B18) + catch-audit (B19) + environmental catalogue. THIS is the design to ratify or break.
- `consensus-r3-revised.md` (B1-B10), `anchor.md`, `jrom-evidence-addendum.md`, `../../north-star.md`.

## 1. Context
6 rounds done. Findings have shrunk to spec-completeness/robustness (R6: wiring + setSinkId-timeout + play-catch-audit + reset-guard) — all now folded into v2.1. Environmental paths (OS-exclusive device, background throttle, undecodable track) are catalogued as out-of-scope-but-detected. Earliest exit = 3 CONSECUTIVE rounds with NOTHING new. We are at 0 — R6 found real items. Be honest: if v2.1 is genuinely complete, SAY SO (that is how we converge). If not, name the gap precisely. Do NOT invent nits; do NOT rubber-stamp. Prior FIX1-5 shipped and still failed.

## 2. Your task — read v2.1 AS THE IMPLEMENTER
**Q1 — Implementation-completeness:** Is every required change enumerated with a concrete file:line target such that an implementer could write it with NO further design decisions? List any requirement that is still ambiguous (who owns it, what file, what exact behavior).
**Q2 — Re-attack the closers (B14-guard, B17 wiring, B18 timeout, B19 catch, B20 sink-reject):** is each correct AND complete? Specifically: does the B17 syncPeers-diff correctly handle a publisher whose STREAM object identity changes but clientId stays (mid-call track replace)? Does B18's "play anyway on timeout" ever route to a wrong/silent device without a banner? Does B14's "re-check flag after await" fully close the race?
**Q3 — One more silence sweep, IN-SCOPE only:** ignoring the catalogued environmental paths, is there ANY remaining path where the host (Chrome, setSinkId-supported, default device audible — JROM's exact environment) gets silent remote audio WITH NO BANNER? If yes, name it. If no, say so explicitly.
**Q4 — Declare:** If after Q1-Q3 you find nothing new beyond v2.1: write EXACTLY "NO NEW ISSUE — design v2.1 complete and implementation-ready". Else list the new item(s) with file:line.

## 3. Output — write `<role>-verdict-r7.md`:
```
# <role> verdict — T1 round 7
## Q1 — completeness gaps (or none)
## Q2 — closers re-attack: B14/B17/B18/B19/B20 each OK or gap
## Q3 — in-scope silence sweep: any silent-no-banner path? (name it or "none")
## Q4 — "NO NEW ISSUE — design v2.1 complete and implementation-ready"  OR  new item(s)
STATUS: AGREE — v2.1 complete, implementation-ready, no in-scope silent-no-banner path
   OR
STATUS: REVISE — <one-line gap>
```
Evidence at file:line. No code edits outside your verdict file.
