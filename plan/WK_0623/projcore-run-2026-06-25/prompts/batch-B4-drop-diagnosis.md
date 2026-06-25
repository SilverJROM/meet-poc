# B4 — Diagnose the HRIS_TOJ mid-call drop (codex55, IMPLEMENTER / read-only)

**Role:** Diagnostic investigator. **Repo:** ~/websites/meet-poc. **Scope: READ-ONLY — no code edits, no deploy.** Produce a verdict with evidence.

## The incident (JROM)
On a real call in room **HRIS_TOJ** (`11215094570c`), the remote client (the woman, host could not see/hear her) **dropped for several minutes, then reconnected**. JROM's rule (north-star D2): **if it was HER internet → non-issue, document with proof; ONLY flag a fix if you can prove something in OUR app caused or worsened it.**

## Evidence already on hand (verify + go deeper)
- Backend out log `logs/meet-poc-be-out.log`: media-state for `11215094570c` flowed until **03:12:02**, then a ~11.5-min gap, then `sfu-publish` at **03:23:37**, call ended 03:24. The session: `meeting_sessions` id `4ce56267…`, host `silverjrom@gmail.com`, started 01:36:50, ended 03:24:18 `host-close-room`.
- The DB is `./data/meet-poc.sqlite`. There is a `meeting_session_diagnostics` table (the FIX5 international-call diagnostics capture).

## Tasks
1. **Pull the per-leg diagnostics** for this session from `meeting_session_diagnostics` (and any related diagnostics rows): ICE state, candidate types (relay/srflx/host), RTT over time, packets/bytes, any transport-recovery / relay-refetch events, around the 03:12→03:23 window. If the table is empty for this session, say so explicitly (that itself is a finding — diagnostics not captured).
2. **Reconstruct the outage**: when media stopped, how long, what the client/host transport did, and whether the reconnection at ~03:23:37 was our recovery logic (transport-recovery / relay re-fetch — FIX4) firing, or the client's network simply coming back.
3. **Attribute**: classify as **(a) client-side internet** (network dropped on her end; our app behaved correctly / recovered as designed), or **(b) app-caused / app-worsened** (e.g. our SFU dropped the subscription, a renegotiation bug, a relay we failed to re-fetch, a watchdog that didn't fire). Rule our app IN or OUT with concrete evidence — do not hand-wave.
4. If **(b)**, identify the exact mechanism + file:line, and propose the atomic fix (so projcore can queue it). If **(a)**, state the proof that our side was healthy/recovered.

## Deliverable
`validation/drop-diagnosis.md`: timeline table (timestamp → event → leg → metric), the verdict line **`VERDICT: client-internet (non-issue)`** or **`VERDICT: app-caused — <mechanism>`** or **`VERDICT: inconclusive — diagnostics-not-captured`**, and evidence for it. If diagnostics weren't captured, note that the capture gap is itself worth fixing.

## Callback contract (MANDATORY)
FIRST action in your reply (before prose): append `[callback] B4 codex55 <STATE> <timestamp>` to `plan/WK_0623/projcore-run-2026-06-25/callbacks/B4.md` (STATE = DONE or BLOCKED). Then investigate. End your final reply with `STATUS: DONE` or `STATUS: BLOCKED <reason>` on the last line. Read-only — no edits, no deploy.
