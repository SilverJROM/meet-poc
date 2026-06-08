# queue.md — projcore-run-2026-06-08 (host-inaudible-remote-audio) — DYNAMIC

- [DONE] T1: Deliberation CONVERGED @ R7 (design v2.2, 22 fixes) - root cause + fix unanimous; JROM elected to red-team the CODE
- [DONE] IMPL-1: Make the host hear every remote person - one audio element per person (registry core + recovery)
- [DONE] IMPL-2: Make sure the app never silently drops a person's audio (reclaim-safe mid-guard + 2-publisher test)
- [DONE] IMPL-3: Capture call data proving audio reached the speaker next time (media-playout + playout diagnostics)
- [DONE] CODE-REDTEAM: GATE PASSED (CRITICAL 3/3 over 13 lenses) - audio fix solid, security closed, zero regression
- [PENDING] VALIDATE: Independent validation + rebuild live app for a real US<->PH re-test

Notes: T1 done (design = consensus-r4-registry.md v2.2). IMPL built by a dedicated implementer (verifier != fixer); projcore + independent validator review each. CODE-REDTEAM applies JROM's 3-clean gate to the implemented diff.
