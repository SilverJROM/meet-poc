---
date: 2026-07-03
project: meet-poc
type: scope-addition
trigger: JROM mid-run testing-protocol instruction
source: projcore
priority: high
search_hooks: [dev_machine, peer2 machine, reproduce first, confirmation only, rm -rf, destructive command, grok build remote agents]
---

## What was decided

Testing protocol for every batch's fix/retry loop in this run: reproduce-first on dev_machine
(LAN, `192.168.254.123`), Peer2's machine used for confirmation only (not iteration). Grok Build
for agents spawned on either remote machine. dev_machine shut down when not actively needed.
Hard safety rule: Peer2's-machine agents may never run a delete/removal command — a prior
incident deleted Chrome via `rm -rf` on his machine.

Two new operations-guide files created: `local_dev/peer2_machine.md` (new, mirrors the existing
`local_dev/dev_machine.md`) documenting the hard safety rule + access mechanism + this run's
reproduce-first/confirm-only split. Existing memory
`feedback_peer2_machine_session_cleanup.md` updated in place to carry the hard rule (was
previously cleanup-only guidance) since it's the same topic, not a new one.

## JROM verbatim

"also when testing this use dev machine, you should have a file on this and peer2's machine to
recreate some errors and test the solution. try to recreate the issues first on dev_machine for
all loops and include peer2's machine for confirmation only. also use grok build on the agents
inside the machines, and shutdown dev_machine when you dont need it and also done have the agent
on peer2's machine do any delete as previously it perform an rm -rf and delete the chrome browser
on the machine, lets not make this happen again."

## Why coordinator-derived default didn't cover this

The frontloaded interview only established app-scope (LOCAL only, no DEV deploy) — it did not
anticipate a dedicated remote-machine testing protocol with a hard safety constraint. This is a
genuine mid-run addition, not a gap in my original interview.

## Reasoning / scope tension flagged (not silently resolved)

JROM's "LOCAL only" answer and "include peer2's machine for confirmation" are in tension: Peer2's
machine is not LAN-reachable, so confirming against it implies the code path must be reachable
from the internet at that point — likely a scoped DEV deploy right before the Peer2-confirmation
step, matching the WK_0701 precedent (local proof -> DEV deploy -> Peer2 confirmation ->
dev_machine shutdown). I proceeded on this reading (dev_machine testing stays LAN-only, no DEV
deploy needed; only the Peer2-confirmation step implies a scoped deploy) and flagged it back to
JROM in-chat + in north-star.md rather than silently assuming either extreme (full DEV deploy
now, or refusing Peer2's-machine use entirely). This is a NEEDS-INFO-adjacent flag (§1.12) since
a frontloaded answer may need amending, but not a full stop — the ambiguity doesn't block any
in-flight work (dev_machine-based reproduce/fix loops proceed regardless of how it resolves).

## Counterfactual

Could have silently kept strict LOCAL-only and told JROM Peer2's-machine confirmation isn't
possible this run — rejected, since JROM clearly wants it included and the WK_0701 precedent
shows exactly how to reconcile it (deploy only at the final confirmation step, not throughout).

## Promotion target

The hard Peer2's-machine no-delete rule is already promoted to persistent memory (not just this
run's north-star) given the severity of the prior incident — flagged at `/jweek` is unnecessary,
it's already live for all future sessions via the updated memory file.
