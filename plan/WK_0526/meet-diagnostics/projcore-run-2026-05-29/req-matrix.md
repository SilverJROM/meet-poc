# req-matrix — coverage (updated after every batch)

| Req# | Requirement (verbatim, first 80 chars)                                          | Batch | Evidence | Status   |
|------|---------------------------------------------------------------------------------|-------|----------|----------|
| R1   | Local mic-energy metric populated on ALL clients — outboundAudioLevel/energy/mic | B1    | validation/batch-1.md (logic+build+test+diff; live-confirm @Phase2) | VERIFIED |
| R2   | Silent-mic detection + actionable warning + switch-microphone                    | B2    | validation/batch-2b.md (live-confirm @Phase2) | VERIFIED |
| R3   | Robust microphone selection (external mic actually used; no dead default track)  | B2a   | validation/batch-2a.md (live-confirm @Phase2) | VERIFIED |
| R4   | User-level diagnostics on/off toggle (Settings, default ON)                      | B3a   | validation/batch-3a.md (live @manual) | VERIFIED |
| R5   | Global/admin diagnostics kill-switch (backend gate + clients stop)               | B3b   | validation/batch-3b.md (live @manual) | VERIFIED |
| R6   | Guest/all-sides reliability + per-participant attribution (queryable)            | B4a   | validation/batch-4a*.md (live @manual) | VERIFIED |
| R7   | Surface remote audio health; flag a silent remote in diagnostics view            | B4b   | validation/batch-4b.md (render @manual) | VERIFIED |
| R8   | Device self-test fidelity — no false pass; test reflects real transmit path  | B5    | validation/batch-5.md (live flag @manual) | VERIFIED |
| R9   | Back-to-rooms control on the /join page (re-requested; missed yesterday)       | B6    | validation/batch-6.md | VERIFIED |
| R10  | Automatic fallback across available mics before warning (amends R3/AC5)        | B2c   | validation/batch-2c.md (live adoption @manual) | VERIFIED |

Statuses: UNASSIGNED → ASSIGNED → IN-PROGRESS → CLAIMED → VERIFIED (or FAIL).
Final acceptance: all rows VERIFIED.
