# Requirements Coverage Matrix — WK_0701 SFU Self-Heal

Statuses: UNASSIGNED → ASSIGNED → IN-PROGRESS → CLAIMED → VERIFIED (or FAIL).
Final acceptance: every row VERIFIED. No row may be non-VERIFIED at run complete.

| Req# | Requirement (verbatim, first 80 chars)                                              | Batch(es)   | Evidence | Status   |
|------|-------------------------------------------------------------------------------------|-------------|----------|----------|
| R1   | Fault-injection reproduction: force 406 / advertised-not-subscribed / stalled audio | B1          | validation/batch-B1.md + batch-B1/independent-validation.md | VERIFIED |
| R2   | Subscribe-failure self-healing: cap escalates retry&renegotiate&SFU rejoin, no give | B2a,B2b | validation/batch-B2a.md + batch-B2b.md (elite red-team) | VERIFIED |
| R3   | Stalled remote-audio detection: broken vs healthy-silence; per-publisher recovery | B3 | validation/batch-B3.md + batch-B3/independent-validation.md | VERIFIED |
| R4   | Publish/PC-failure recovery: hasPc:false / publish-not-established recovered         | B4          | —        | ASSIGNED |
| R5   | Diagnostics honesty: 406 not lastGumError; per-layer fields; advertised-not-subscr. | B5          | —        | ASSIGNED |
| R6   | Multi-participant coverage: 2p + 5p local; JROM+Peer2; 3-way; human-audible final   | B6,B7,B8,B9 | —        | ASSIGNED |

## Notes
- R6 spans local capstone (B6) → agent-measured remote (B7/B8) → human-audible (B9).
- R6 is NOT VERIFIED until JROM confirms he heard Peer2's sound in B9.
