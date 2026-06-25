# B6 — Harden diagnostics: capture per-client diagnostics for the FULL session (codex55, IMPLEMENTER)

**Role:** IMPLEMENTER. **Repo:** ~/websites/meet-poc, branch `main`. Atomic, tight diff. This is an ISSUE → reproduce-first.

## The gap (from B4 drop-diagnosis)
In the HRIS_TOJ session, the **host** captured 684 diagnostic samples spanning the whole call (01:58→03:24), but the **remote participant (Joanne)** captured only **21 samples, stopping at 02:04:39** — the first ~2.5 min. Because remote-side diagnostics died early, we could NOT directly attribute her mid-call drop. We need **every client to capture + persist its diagnostics for the entire session**, not just the opening minutes.

## Reproduce-first (§1.4h — by inspection + a real check)
1. Confirm the asymmetry in `./data/meet-poc.sqlite`: 
   `SELECT client_id, count(*), min(...), max(...) FROM meeting_session_diagnostics WHERE session_id LIKE '4ce56267%' GROUP BY client_id;` (or the right session/column names — inspect the schema). Show that one client's samples stop early while another's continue. That asymmetry IS the repro.
2. Find the capture path: how a client samples its own diagnostics and posts them. Start at `frontend/src/app/services/meeting-sessions.service.ts`, `frontend/src/app/services/sfu-client.service.ts`, and wherever diagnostics samples are produced/sent (grep `diagnostic`). Backend write side: `backend/src/modules/sessions/store.ts` (`meeting_session_diagnostics`).

## Find the root cause + fix
Determine WHY a client stops sending diagnostics partway through (candidates — confirm which is real, don't guess): a sampling `setInterval` cleared early / on some state transition; a **sample cap** (first N only); capture tied to a phase that ends (e.g. only during connect/subscribe, not steady-state); throttling on tab-background (`visibilitychange` / timer throttling); or capture stopping when a peer's media-state settles. **Fix the actual mechanism** so each client keeps sampling+posting at a sane cadence for the full call (until it leaves), including when the tab is backgrounded if feasible. Keep the cadence reasonable (don't spam — match the existing interval).

## Tests
- A focused test proving the sampler keeps emitting past the early window / isn't capped (unit test on the sampling loop, or assert no early-clear). Add to the relevant `*.spec.ts`.
- Don't break existing diagnostics tests.
Run touched-scope tests — green.

## Constraints
Tight diff, no unrelated refactors, no TODOs (pre-live). Don't change the diagnostics schema unless strictly necessary (if you do, add a migration).

## Deliverable
`validation/B6-changes.md`: the confirmed root cause (with the DB asymmetry evidence), the fix (file:line + mechanism), test output (PASS). Note that a full live re-verification (a multi-min 2-party call showing both clients capture end-to-end) is the validator's job.

## Callback (MANDATORY)
FIRST action (before prose): append `[callback] B6 codex55 <STATE> <timestamp>` to `callbacks/B6.md`. You MAY reply `STATUS: PROPOSED <root-cause + fix approach>` first for my sign-off (recommended — confirm the mechanism before coding), else `STATUS: DONE` / `STATUS: BLOCKED <reason>` on the last line.
