---
date: 2026-07-05
project: meet-poc
type: operator-instruction
source: projcore
search_hooks: [dev_machine, peer2, validation]
---

# Remote Validation Protocol

JROM instructed that fixes must be tested on dev_machine and Peer2's computer before handback.

Decision:
- dev_machine is the reproduce-first and fix-validation remote client.
- Peer2's computer is confirmation-only.
- dev_machine must be shut down after the validation window if no longer needed.
- Every Peer2-machine prompt must include the locked no-delete/removal safety rule.

Operational sources:
- `/home/agjrom/websites/local_dev/dev_machine.md`
- `/home/agjrom/websites/local_dev/peer2_machine.md`

Escalation rule: only surface if a validation environment is unreachable in a way that blocks honest
acceptance, or if a requested action would violate the Peer2 safety rule or QA/PROD/auth/RBAC stop list.
