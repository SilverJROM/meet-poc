# Queue — Voice SFU Self-Heal (WK_0701)

Dynamic (§1.4b): JROM may inject issues mid-run; drained at batch boundaries.
Label = business-friendly (§1.4e); engineering detail in prompts/ + implementation-plan.md.
Run complete when queue empty AND every req-matrix row VERIFIED.

- B0 [done] — Agree the exact recovery strategy so the fix is final, not guesswork
- B1 [done] — Reliably recreate the "can't hear each other" failure on demand
- B2a [done] — Stop giving up after retries: escalate to renegotiate instead of quitting
- B2b [done] — Last-resort self-heal: rejoin the media session cleanly when nothing else works
- B3 [done] — Notice when someone's audio has silently died and fix it
- B4 [done] — Recover a person whose mic never actually connected
- B5 [done] — Make the diagnostics tell the truth about what failed
- B6 [pending] — Prove it holds for both 2-person and 5-person calls
- B7 [pending] — Prove Peer2 and JROM hear each other on a real remote call
- B8 [pending] — Prove a 3-way call heals, then power down the dev machine
- B9 [pending] — JROM opens a room and hears Peer2's machine play a sound (final acceptance)

## Batch metadata (internal routing — not shown in ovm)

| Batch | Req  | complexity | deliberation | red-team          | bucket     |
|-------|------|------------|--------------|-------------------|------------|
| B0    | —    | high       | DELIB        | —                 | SHORT      |
| B1    | R1   | high       | —            | —                 | MEDIUM     |
| B2a   | R2   | high       | (B0 done)    | —                 | MEDIUM     |
| B2b   | R2   | high       | (B0 done)    | REDTEAM:elite     | MEDIUM     |
| B3    | R3   | high       | —            | REDTEAM:standard  | MEDIUM     |
| B4    | R4   | high       | —            | REDTEAM:standard  | MEDIUM     |
| B5    | R5   | medium     | —            | —                 | SHORT      |
| B6    | R6   | high       | —            | REDTEAM:standard  | TEST-HEAVY |
| B7    | R6   | high       | —            | —                 | MEDIUM     |
| B8    | R6   | high       | —            | —                 | MEDIUM     |
| B9    | R6   | low        | —            | —                 | SHORT      |

## Notes
- B7/B8 are agent-measured (RTP + energy + diagnostics). B9 is the human-audible gate.
- dev_machine (Grok Build) shutdown at END of B8, BEFORE the B9 ping to JROM.
- B9 is BLOCKED-for-human (JROM performs the audible test).
- Prior-art `resubscribe` WIP (prior-art/uncommitted-resubscribe-attempt.patch) feeds B0/B2.
