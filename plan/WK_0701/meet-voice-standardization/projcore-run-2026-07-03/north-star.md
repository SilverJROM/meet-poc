# North Star — Voice Standardization & Reliability Run

Append-only. JROM's verbatim answers, dated, indexed by topic.

## 2026-07-03 — Frontloaded interview answers

- **Env scope:** LOCAL only. "there is no dev this is just local for now." No DEV deploy this
  run; voice.silverjrom.app is not touched.
- **Topology:** 3-agent (independent validator, separate from coordinator + implementer).
  Note: §1.21 parallel-DEV-reproduction does NOT trigger (requires local+dev; scope is
  LOCAL-only) — 3-agent here means independent-validator-on-LOCAL only.
- **Cadence scope (R1):** mic-silence watchdog retry loop ONLY. Explicitly NOT the WK_0701 SFU
  subscribe-recovery escalation ladder (retry->renegotiate->rejoin) — that cadence is untouched
  by this run.
- **Sequencing:** reliability first (R1-R4), then features (R5 balancer, R6 room password),
  then R7 (Ionicons, low severity) last.

## 2026-07-03 — Roster LEANED DOWN (supersedes the custom roster below, still /projcore)

JROM verbatim: "now let me give you a leaner team you (sonnet5), and agents you can use are grok
composer, grok build, gpt53 spark (only) on this task lean to consume 10-15% of sonnet on this
task and leaverage the other members completely" — then, after confirming this stays under
/projcore: "yes still use /projcore setup and just use a leaner team."

**Effective immediately, replaces the codex55+Opus dual-co-planner roster below for remaining
batches (B2-B7) and any live/manual verification work:**
- **Coordinator:** Sonnet 5 (me) — target ≤10-15% of the task's total effort/consumption directly;
  the rest is delegated to and driven by the worker agents below, checked in on lightly (final
  reports / genuine blockers), not micromanaged turn-by-turn.
- **Workers (the only agents to use going forward):** Grok Composer, Grok Build, GPT-5.3 Codex
  Spark. No Opus co-planner, no separate codex55 planner/validator sessions for new work — those
  roles fold into whichever of these three is most appropriate per task (e.g. spark for
  validation-style scrutiny, composer/build for implementation and live-testing legwork).
- Still `/projcore` (persona, artifacts, gates, requirements-driven discipline all still apply)
  — only the roster/consumption-split changed, not the coordination framework.

B1 (already VERIFIED under the prior roster) is not retroactively affected. Redteam pool for
remaining batches: draw from {grok composer, grok build, gpt-5.3 spark} instead of the prior
{sonnet, opus, codex55, spark} pool, consistent with "leverage the other members completely."

## 2026-07-03 — Custom agent roster (JROM explicit, supersedes projcore standard default) — SUPERSEDED above, kept for history

JROM verbatim: "for this task i want your co-planner is both codex55 and opus, you guys discuss
each of the issues/new feature one at a time and debate on how to fix it and create a plan with
all 3 of your agreeing per item, do this one at a time, you need to agree before moving forward,
decide as well w/c would be a candidate for red teaming after task implem, implementer is
L1=grok composer/spark (either), L2=grok build, L3=sonnet, validator is codex55, team is
sonnet5,opus,codex55, spark for deliberation or red team if needed based on the deliberated
per task approach."

Follow-up (2026-07-03): "this deviates from the normal projcore as this is kind of a recurring
issue on the app and i want to fix this this time or get close to the best version of the app."
— explicit acknowledgment this is a deviation from projcore's standard routing, requested
because this class of bug (call audio reliability) has recurred multiple times
(WK_0526 remote-audio-e2e, WK_0623 audio-reconnect-fix, WK_0701 SFU self-heal) and JROM wants
maximum planning rigor this pass rather than the default JIT single-planner handshake.

**Roster:**
- Coordinator: Opus (projcore, inline) — never implements.
- Co-planner 1: Codex 5.5 (ephemeral tmux planner session).
- Co-planner 2: Opus (ephemeral tmux planner session, separate from the coordinator seat).
- Implementer L1: Grok Composer OR Spark (either, interchangeable).
- Implementer L2 (escalation): Grok Build.
- Implementer L3 (escalation): Sonnet.
- Validator: Codex 5.5 (own dedicated session, independent of co-planners + implementer).
- Deliberation/red-team pool: Sonnet, Opus, Codex 5.5, Spark — drawn from per-item as decided
  during that item's deliberation. Grok Build/Composer/Spark-as-implementer are NOT part of the
  red-team pool in their implementer capacity; Spark MAY be drawn into the pool separately per
  JROM's explicit inclusion.

**Deviation from standard (§1.14) — logged per policy requiring supersession log on first use:**
1. Deliberation (§1.4f) runs for **every item**, not trigger-gated, with a 2-external-voice
   (codex55 + dedicated Opus planner) + coordinator roster instead of the standard 4-voice
   panel (Opus+Codex5.5+Sonnet+Spark).
2. Red-team pool restricted to {sonnet, opus, codex55, spark} — no grok-build/haiku in
   red-team roles (grok-build reserved for implementation L2 only).
3. Full decision-logging entry: `decisions/2026-07-03-custom-roster-supersession.md`.

**Sequencing of deliberation vs implementation (projcore autonomous call, JROM said "godspeed"
without picking explicitly between full-upfront-planning vs JIT-interleaved):**
Decision: **JIT-interleaved, one item at a time** — deliberate item N (codex55 + Opus-planner +
coordinator reach agreement + redteam-candidate flag) -> dispatch item N's implementer -> gate
-> THEN deliberate item N+1. This matches JROM's literal "one at a time... agree before moving
forward" phrasing (read as moving forward to implementation of that item, not merely to the next
deliberation) and keeps projcore's normal one-batch-at-a-time discipline intact. Counterfactual
considered and rejected: deliberating all 7 items up front before any implementation starts —
rejected because it disconnects later items' planning from earlier items' real implementation
feedback, and delays the reliability-first fixes JROM wants landed soonest. Logged per
trust-defaults ALWAYS-OK ("reasonable default when JROM's answer leaves a detail unspecified").

## 2026-07-03 — Testing protocol: dev_machine reproduce-first, Peer2's machine confirm-only

JROM verbatim: "also when testing this use dev machine, you should have a file on this and
peer2's machine to recreate some errors and test the solution. try to recreate the issues first
on dev_machine for all loops and include peer2's machine for confirmation only. also use grok
build on the agents inside the machines, and shutdown dev_machine when you dont need it and also
done have the agent on peer2's machine do any delete as previously it perform an rm -rf and
delete the chrome browser on the machine, lets not make this happen again."

**Protocol (applies to every batch's testing loop in this run):**
1. **Reproduce-first on dev_machine (`192.168.254.123`, same LAN as this host).** For every
   item, recreate the failure on dev_machine BEFORE attempting a fix, and re-validate the fix
   there — this is the primary iteration loop. Operations guide:
   `/home/agjrom/websites/local_dev/dev_machine.md`.
2. **Peer2's machine is CONFIRMATION-ONLY**, not part of the fix/retry loop — used once a fix
   already works on dev_machine, as a final real-world check. Operations guide (includes the
   HARD safety rule below, verbatim):
   `/home/agjrom/websites/local_dev/peer2_machine.md`.
3. **Model:** agents spawned ON dev_machine or Peer2's machine for this run's testing = **Grok
   Build** (distinct from this run's local L1/L2/L3 implementer ladder, which stays
   grok-composer/spark -> grok-build -> sonnet).
4. **Power management:** wake dev_machine only when a testing loop needs it; shut it down
   (`ssh silverjrom@192.168.254.123 'sudo nohup poweroff >/dev/null 2>&1 &'`) as soon as that
   loop's testing is done, not left running idle between batches.
5. **🔒 HARD SAFETY RULE — no exceptions:** an agent driven on Peer2's machine must NEVER run a
   delete/removal command of any kind (`rm`, `rm -rf`, uninstalls, package removal, browser-
   profile wipes). A prior agent session ran `rm -rf` on Peer2's machine and deleted his Chrome
   browser installation — this must never happen again. Peer2's-machine agents are
   test-and-report only. Every brief sent to an agent on Peer2's machine MUST include this rule
   verbatim before any task instructions. Mirrored to
   `~/.claude/projects/-home-agjrom-websites-meet-poc/memory/feedback_peer2_machine_session_cleanup.md`
   so this persists across sessions, not just this run.

**Scope question raised by this addition — RESOLVED by JROM (2026-07-03):** "those machines are
just callers for testing, we are not migrating anything to them, we are just asking them to call
or join our room so we can test." dev_machine and Peer2's machine are never deploy/migration
targets — they are just remote browser clients that join whatever room we point them to, exactly
like a real participant would. This does not change "LOCAL only" for the app itself: dev_machine
(same LAN) joins the LOCAL instance directly over LAN, no deploy involved, and is the PRIMARY
reproduce-and-test loop for every item (JROM reinforced this again: "it's better if we can just
test first using dev_machine" — dev_machine-first is the standing default for every item's
recreate + fix-validate cycle). Peer2's machine, being non-LAN, can only reach whatever is
already publicly reachable — his confirmation pass is a later-stage step whenever that
reachability question actually comes up in practice (not something to pre-solve now); it does
not block or gate any dev_machine-based work in this run.

## Effort Policy (source: projcore, derived 2026-07-03)

Posture: B (elevated) — this run touches realtime-media/audio-pipeline code
(`mic-energy.ts`, `sfu-client.service.ts`, `remote-audio.service.ts`,
`active-speaker.service.ts`, `room.page.ts`) that JROM has flagged as a recurring problem class
across 4 prior runs (WK_0526 x2, WK_0623, WK_0701). Mandatory per-item deliberation (see above)
already provides planning rigor; per-task effort tier below governs implementer/validator
reasoning depth on top of that.

| Item | Touches | Complexity tier |
|---|---|---|
| R1 (mic-silence retry cadence) | `mic-energy.ts`, `room.page.ts` — realtime, retry-storm risk | high |
| R2 (Opus bitrate/RED/FEC) | `sfu-client.service.ts` — SDP/RTCRtpSender, cross-browser risk | high |
| R3 (reconnect resilience) | WS reconnect path, interacts with existing self-heal | high |
| R4 (host silent/reconnect indicator) | UI surfacing of existing state, low novel-logic risk | medium |
| R5 (volume balancer) | new WebAudio graph, interacts with active-speaker.service.ts | high |
| R6 (room password/admission) | new room setting + admission flow, RBAC-adjacent | medium |
| R7 (Ionicons prod-build fix) | isolated, well-scoped repro | routine |

xhigh: none stamped at intake (0%, under the 3% cap). Re-stamp allowed at Phase 0.5 if
codex/opus co-planners counter-propose (higher wins, per tier-conflict rule).

## Deliberation candidates (pre-approved — all 7 items, per JROM's custom roster ask above)

Every item runs deliberation. No separate candidate-selection sub-list needed — superseded by
the "every item" rule above.

## Redteam candidates

Not pre-selected at intake — JROM's instruction folds redteam-candidate selection INTO each
item's deliberation output (decided per-item, not projcore alone at Phase 0). Will be recorded
per-item in `deliberation/<item>/consensus.md` and mirrored to `redteam/redteam-candidates.md`
as each item's deliberation concludes.

## Issue-routing escalation ladder (§1.4h)

Default approved (L1 red-team -> L2 coordinator-itself -> L3 JROM last resort) — not objected to.
Applies to R7 (Ionicons) which is a true "issue" (regression path); R1-R6 are new-functionality/
enhancement paths (standard build->verify), not issue-reproduce-first, EXCEPT R1 where the
underlying "acctg silent for 61min" behavior is itself a reproducible issue the fix must
demonstrably resolve — validator reproduces the stuck-silent-mic scenario via fault injection
BEFORE the R1 fix is accepted, per §1.4h.

## Open item — not folded into this run

Deploy-status gap: transcript/recordings library grouping (commits `fb88436`..`7513020`) merged
to main but not yet live (pm2 meet-poc-fe/be last restarted before those commits). JROM has not
given a decision on this yet — flagged, not blocking, not a numbered requirement here.
