# Queue (DYNAMIC — §1.4b)

Status legend: [pending] [in-progress] [done] [blocked]. Label = business-friendly (§1.4e), <=120 chars. Engineering meta on the indented line below each (parser ignores it).

- B0 [done] — Get our call running and prove two automated callers can hear each other on one machine
  meta: complexity medium | Req R1 | bucket MEDIUM
- B1 [done] voice 2-way GREEN. B4 [in-progress] — 3-way 6/6 (1 inferred); 4-way 12-pair explicit | ~31/50
  meta: complexity high | Req R2 | bucket MEDIUM
- B2 [pending] — Make sure Peer2's machine can hear us
  meta: complexity high | Req R3 | bucket SHORT
- B3 [pending] — Make sure we can hear Peer2's machine
  meta: complexity high | Req R4 | bucket SHORT
- B4 [pending] — Get a third caller in and confirm everyone hears everyone
  meta: complexity medium | Req R5 | bucket MEDIUM
- B5 [pending] — Prove it works the same way twice in a row on a fresh call
  meta: complexity medium | Req R6 | bucket SHORT
- B6 [pending] — (Stretch) Confirm video also goes both ways
  meta: complexity medium | Req R7 | bucket SHORT

## Injected (mid-run, drained at boundaries)
(none yet)

## TASK (JROM-raised 2026-06-21): GHOST-PARTICIPANTS cleanup
- Disconnected/stale participants linger as ghosts in room (real-call bug + breaks per-user recording via recorder OOM). JROM experienced on a real call. Investigate signaling disconnect→presence-removal→broadcast; co-plan codex55; fix sonnet; regression test. See plan/WK_0526/list/2026-06-21-ghost-participants.md. +5 tries granted.
