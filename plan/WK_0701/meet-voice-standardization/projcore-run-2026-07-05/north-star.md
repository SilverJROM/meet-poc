# North Star — App Issue Closeout Continuation

Append-only. Current controlling instruction is JROM's 2026-07-05 greenlight.

## 2026-07-05 — Autonomy and escalation

JROM directed projcore to proceed autonomously, derive the answer with co-planner/team, decide, and
move on. Escalate only true blockers or changes that would break the app unrecoverably.

Practical stop list for this run:
- irreversible/data-loss action
- auth/RBAC/security boundary change
- new paid resource or third-party dependency with cost
- QA/PROD deploy
- explicit contradiction with requirements or project_specs.md
- repeated validation non-convergence after the projcore ladder

## 2026-07-05 — Team roster

- Coordinator: codex55 (current session)
- Co-planner: Sonnet 5
- Implementers L1: Spark, Grok Composer
- Implementers L2: Grok Build, Haiku
- Validator: codex55, separate session from any fixer where possible
- Deliberation/red-team pool: Grok Build, codex55, Spark, Grok Composer, Haiku, with Sonnet 5 as
  co-planner where useful

Availability check at intake:
- codex55: available, strong headroom
- Spark: available, moderate headroom
- Grok Composer/Grok Build: CLI lists models, usage unknown
- Sonnet: local Claude CLI available, usage unknown
- Haiku: no local canonical launch command in projcore runtime; use only if a working CLI route is
  discovered without auth-file probing, otherwise substitute Spark/Grok while preserving role separation

## 2026-07-05 — Run policy

Lifecycle: pre-live, deferral OFF. Queue rows gate completion.

Primary priority order:
1. Voice reliability and user-hearing problems.
2. Access/admission features.
3. Production-build/runtime correctness.
4. Deploy verification and test-hygiene cleanup.

Local-first validation. DEV deploy is allowed only where project_specs.md defines the target as DEV
and the batch reaches deploy-ready state. QA/PROD deploy requires escalation.

## 2026-07-05 — Remote validation requirement

JROM added after greenlight: every relevant fix must be tested on dev_machine and Peer2's computer
before final handback.

Protocol:
- dev_machine (`192.168.254.123`) is reproduce-first and fix-validation. Wake it with
  `/home/agjrom/websites/local_dev/wake-123.py`, use the gateway at `http://192.168.254.123:8787`,
  and shut it down with `ssh silverjrom@192.168.254.123 'sudo nohup poweroff >/dev/null 2>&1 &'`
  when no longer needed.
- Peer2's computer is confirmation-only through JohnnyOne relay. Every Peer2-machine prompt must
  include the hard safety rule: no delete/removal command of any kind; test-and-report only.
- Agents on remote machines use Grok Build where possible.
- If a specific batch cannot honestly be validated on one remote machine because reachability or
  environment state blocks it, record exact evidence and decide whether it is a true blocker under
  the stop list.

## Carry-forward from 2026-07-03

R1 persistent mic-silence self-heal is implemented and validated at commit d2cbce9 on the current
branch. It is not merged/deployed. Owed: standard red-team and post-fix retry-cadence regression
proof. Remaining R2-R7 were not started before the pause.
