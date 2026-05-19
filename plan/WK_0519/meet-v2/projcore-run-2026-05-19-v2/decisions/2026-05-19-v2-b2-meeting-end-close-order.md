---
date: 2026-05-19
project: meet-poc
type: autonomous-call
source: codex-lead
priority: high
search_hooks: [meeting-ended-by-host, closeSession, liveRooms, close cascade]
---

**Decision:** On `meeting-ended-by-host`, close the `meeting_session` and delete the `LiveRoom` before closing peer sockets.

**Why:** Closing sockets first triggers each peer's `ws.on('close')` handler, which also mutates admitted/pending state and can close the session for `last-peer-left`. Deleting the live room before closing sockets makes those close handlers no-op for host-end, while the explicit host-end path has already sent `meeting-ended`, rejected pending knockers, and recorded `ended_reason='host-end'`.

**Tradeoff:** No `peer-left` cascade is emitted after `meeting-ended`. That is intentional because the meeting-level terminal event supersedes individual departures.
