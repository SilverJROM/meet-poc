# Decision — Phase 2/3 budget clarified ([north], 2026-07-09)

**Source:** [north] chat (authoritative; supersedes projcore misread of "50 LOCAL only")
**Quote:** "BUDGET CLARIFIED: Phase 2 = 25 fake-device tests (local, current). Phase 3 = 25 live SFU tests (post-confidence gate). Proceed Phase 2 B00S-BUDGET + AC1 on fake-device. Inline cleanup. When Phase 2 PASS, notify for Phase 3 gate."

## Binding

| Phase | Cap | Mode | Scope |
|---|---|---|---|
| **Phase 2 (CURRENT)** | **25** tests | **fake-device**, local | B00S-BUDGET + AC1 on fake-device; unit + local dual-browser OK if fake-device |
| **Phase 3** | **25** tests | **live SFU** | Only after Phase 2 PASS + notify JROM/north for Phase 3 gate |

## Ops

- **Inline cleanup** after every batch (no B21 defer). Protect 652c1475 / testroom01001.
- **maxForks: 3 HARD.**
- **Exit Phase 2:** 25 Phase-2 tests PASS **or** confidence gate → **notify** for Phase 3 gate; **do not** auto-start Phase 3; **do not** shutdown.
- **Address:** all inter-session text uses `[projcore]` / `[north]` brackets — never leading `/` or `$`.

## Supersedes

- Prior projcore read of "50 LOCAL tests only, NO SFU ever in this loop" for Phase 2 exit.
- Total remaining work budget remains 50 = 25 P2 + 25 P3, but P3 is gated.

## Counter

Track Phase 2 in `phase2-counter.md` as **N/25** (not /50). Unit inventory (143) is baseline suite health, not the 25-slot burn of Phase 2 scenarios.
