---
date: 2026-05-19
project: meet-poc
type: autonomous-call
source: codex-lead
priority: medium
search_hooks: [meeting-ended-by-host, host-end, S1.3, B2 boundary]
---

**Decision:** B1 tests assert that `{type:'meeting-ended-by-host'}` remains unwired/no-op until B2, while B1 verifies the two close triggers it actually implements: `last-peer-left` and `host-disconnect-empty`.

**Why:** The B1 prompt explicitly says not to wire `meeting-ended-by-host`; that command and `ended_reason='host-end'` are B2 scope. A B1 test expecting host-end closure would force out-of-scope implementation.

**Tradeoff:** S1.3 is only partially closed in B1. The gap is explicit and should be closed by B2's host-authority batch.
