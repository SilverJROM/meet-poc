---
date: 2026-05-19
project: meet-poc
type: autonomous-call
source: codex-lead
priority: medium
search_hooks: [recording filename, sessionId, backward compatibility]
---

**Decision:** Parse the v2 recording filename shape before the v1 shape.

**Why:** Both formats contain a timestamp, room id, slug, and random suffix; v2 adds a UUID session id before the room id. Trying the longer v2 shape first avoids misclassifying a session-bound file as a legacy file if the slug contains underscores.

**Tradeoff:** Invalid filenames remain hidden from listing/download, matching prior safe-parser behavior.
