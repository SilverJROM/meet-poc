---
date: 2026-05-19
project: meet-poc
type: autonomous-call
source: codex-implementer
batch: B3
priority: normal
search_hooks: [room placeholder, S3.7, /room/:id, B4]
---

**Question considered:** Should B3 add any `/room/:id` route when the lobby/call page is explicitly B4 scope?

**Decision:** Add a minimal `RoomPlaceholderPage` that only calls `GET /api/rooms/:id/exists` and displays `Room not found` for deleted rooms or a "next batch" placeholder for existing rooms.

**Reasoning:** S3.7 requires visiting a deleted `/room/:id` route and observing `Room not found`. The placeholder satisfies that scenario without implementing lobby, knock state, WebRTC, controls, or any B4 call UI behavior.

**Default alternative rejected:** Leave `/room/:id` unrouted and assert only the API. That would under-prove the UI-level S3.7 contract.

**Promotion target:** B4 should replace this placeholder with the actual room page.
