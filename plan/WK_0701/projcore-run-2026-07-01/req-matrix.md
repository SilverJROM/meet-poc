# Requirements Coverage Matrix — WK_0701 SFU Self-Heal

Statuses: UNASSIGNED → ASSIGNED → IN-PROGRESS → CLAIMED → VERIFIED (or FAIL).
Final acceptance: every row VERIFIED. No row may be non-VERIFIED at run complete.

| Req# | Requirement (verbatim, first 80 chars)                                              | Batch(es)   | Evidence | Status   |
|------|-------------------------------------------------------------------------------------|-------------|----------|----------|
| R1   | Fault-injection reproduction: force 406 / advertised-not-subscribed / stalled audio | B1          | validation/batch-B1.md + batch-B1/independent-validation.md | VERIFIED |
| R2   | Subscribe-failure self-healing: cap escalates retry&renegotiate&SFU rejoin, no give | B2a,B2b | validation/batch-B2a.md + batch-B2b.md (elite red-team) | VERIFIED |
| R3   | Stalled remote-audio detection: broken vs healthy-silence; per-publisher recovery | B3 | validation/batch-B3.md + batch-B3/independent-validation.md | VERIFIED |
| R4   | Publish/PC-failure recovery: hasPc:false / publish-not-established recovered | B4 | validation/batch-B4.md + batch-B4/independent-validation.md | VERIFIED |
| R5   | Diagnostics honesty: 406 not lastGumError; per-layer fields; advertised-not-subscr. | B5 | validation/batch-B5.md + batch-B5/independent-validation.md | VERIFIED |
| R6   | Multi-participant coverage: 2p + 5p local; JROM+Peer2; 3-way; human-audible final | B6,B9 | B6 e2e + JROM real-call (Peer2) PASSED 2026-07-01 | VERIFIED |

## Notes
- R6 spans local capstone (B6) → agent-measured remote (B7/B8) → human-audible (B9).
- R6 is NOT VERIFIED until JROM confirms he heard Peer2's sound in B9.
| R7   | Screen-share no infinite-mirror: presenter sees "You're presenting" placeholder, remote sees share | SS | validation/batch-SS.md | VERIFIED |
| R8   | Backgrounds: persist+auto-apply default; custom backgrounds visible to all peers cam-on/off | R8 | — | ASSIGNED |
