# North Star — Voice SFU Self-Heal (WK_0701)

Append-only. Original entries locked mid-run (only JROM amends). Source tags mark authorship.

## The one goal (JROM verbatim, 2026-07-01)
"just fix the app that is the goal." The app must never leave users "connected but cannot
hear each other." Real calls (JROMRoom w/ Peer2; HRIS_TOJ 5-way) failed this and had to move
to Google Meet.

## Frontloaded decisions (JROM, 2026-07-01)

1. **Recovery-cap behavior — ESCALATE, never terminal give-up.** The permanent-stop retry
   cap must escalate retry → renegotiate → full SFU rejoin (fresh cfSessionId) while the user
   is admitted and the publisher advertises audio. (Answered: "Escalate to rejoin".)

2. **Validation scope — full 3-way in-run, agent-measured.** Local proof first, then Peer2,
   then 3-way (JROM + Peer2 + dev_machine), all agent-measured. (Answered: "Full 3-way B8".)

3. **Acceptance ladder / real-call bar (#1 chosen).** Autonomous through agent-measured
   healthy audio both ways; then **dev_machine shuts down FIRST** (its job done), **then**
   projcore pings JROM for the final human test: JROM opens a room, Peer2's machine joins and
   plays a known sound, JROM confirms he HEARS it. Nothing VERIFIED until JROM confirms audible.
   (JROM: "shutdown dev_machine before you ping me ... then me and peer2's machine is the final
   test ... you have greenlight godspeed!")

4. **Grok on dev_machine + Peer2's machine = TEST-CLIENTS only**, not implementers. Local
   agents do all code edits. dev_machine uses **Grok Build** (Composer degraded — revalidate
   gateway before use). (Answered: "Both as test-clients".)

5. **Autonomy + anti-loop.** Run autonomously until fixed; deliberation front-gate + red-team
   back-gate + escalation ladder guarantee convergence-or-escalate, not infinite looping.
   Co-planner session finalizes the [DELIB]/[REDTEAM] assignment lists up front.

6. **Baseline (autonomous, delegated).** Do NOT merge `b8-mesh-retire-wip` (stale/destructive);
   `main` is already the merged deployed baseline. Uncommitted SFU WIP preserved
   (prior-art patch + stash) and started clean off e9aedff. (See decisions/2026-07-01-baseline-and-wip.md.)

## Lineup (JROM-set, 2026-07-01)
- Coordinator: Opus (projcore)
- B0 co-planner (§2a cross-runtime): **codex55** (JROM: "make co-planner as codex55 as you are already opus")
- Implementers L1→L2→L3: local Grok Composer → Grok Build → Sonnet
- Independent validator: codex55 (own session, ≠ planner session)
- Test-clients (validation only): Grok Build @ dev_machine + Grok @ Peer2's + JROM-local

## Standing rules
- Lifecycle: **pre-live** (deferral OFF — deferred work needs a queue.md row landing this run).
- Reproduce-first (§1.4h): validator reproduces each issue on the rendered app before implementer touches code.
- UI-proof (§1.11): for user-visible behavior, acceptance = rendered app (DOM/Playwright + screenshot); API/code-read ≠ acceptance.
- Isolated E2E ports for local repro (§14 env vars: MEET_DB_PATH, E2E_*_PORT) — do NOT clobber live PM2 state. (projcore-derived, clean-technical.)
- Commit/branch per existing convention; branch `fix/sfu-selfheal-20260701`. (projcore-derived.)

## Effort Policy (run-wide, source: projcore, derived 2026-07-01T)
- Expected mix: routine 5% / medium 30% / high 60% / xhigh 5%
  (justification: realtime media + concurrency + external SFU dependency + heisenbug repro →
  effort-tiering "high" triggers fire on most batches; this run legitimately skews high.)
- Cost-quality posture: A (quality-dominant; pre-live, correctness-critical media core).
- Per-module floors:
  - `frontend/src/app/services/sfu-client.service.ts` → floor high
  - `frontend/src/app/services/sfu-roster-utils.ts` / `remote-audio.service.ts` → floor high
  - `backend/src/modules/realtime-sfu/*` → floor high
  - diagnostics/presentation-only tweaks → cap medium
- 3-agent triggers: whole run (independent codex55 validator ≠ grok implementer ≠ opus coordinator).
- §2a planner invocation: YES (large plan, ≥3 tasks, real-time class) — codex55 co-planner at B0.
- JROM-amended: none.
