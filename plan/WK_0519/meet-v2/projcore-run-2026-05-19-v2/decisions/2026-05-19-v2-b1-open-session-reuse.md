---
date: 2026-05-19
project: meet-poc
type: autonomous-call
source: codex-lead
priority: medium
search_hooks: [meeting_sessions, openSession, idempotent, room session reuse]
---

**Decision:** `openSession(roomId, hostEmail)` reuses any open session for the room, rather than limiting reuse to a 2-second started-at window.

**Why:** The locked requirement says an open session is idempotent and reused for a room. A strict 2-second window would allow duplicate open sessions if another peer joined the same ongoing meeting after 2 seconds, which would break B2 recording binding and B4 ongoing/past lists.

**Tradeoff:** A stale unclosed session after a process crash could be reused. That is acceptable for this single-process app and can be addressed later with startup cleanup if needed.
