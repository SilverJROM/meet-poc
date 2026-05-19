---
date: 2026-05-19
project: meet-poc
type: autonomous-call
source: codex-lead
priority: medium
search_hooks: [upload, requireAuth, raw body, recording auth]
---

**Decision:** Run `requireAuth` before `express.raw({limit:'200mb'})` on `POST /upload`.

**Why:** The upload endpoint now rejects unauthenticated users. Running auth first avoids parsing a potentially large request body before rejecting a missing or invalid session cookie. The auth middleware only reads cookies and does not depend on the body.

**Tradeoff:** None for current clients; authenticated uploads still pass through the same raw body parser before the file write.
