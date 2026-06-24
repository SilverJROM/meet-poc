---
date: 2026-06-23
batch: B3a
implementer: claude-sonnet-4-6
---

# B3a Autonomous Decisions

Autonomous decisions: none.

All design decisions were specified in the brief and the pre-locked decision doc
(`decisions/2026-06-23-passwordless-telegram-login.md`). The security model was
replicated verbatim from lokalcamp.

One minor implementation detail resolved without asking: the `complete` endpoint
checks `denied_at` and `consumed_at` before `approved_at` (to return the most
specific error). This is consistent with the spec (single-use, denied state is
terminal) and caught by the tests.
