---
date: 2026-05-19
project: meet-poc
type: autonomous-call
trigger: B1 implementation details while moving legacy files
source: lead
priority: normal
search_hooks: [INITIAL_PASSWORD, legacy-poc, recordings, data.json]
---

**Question considered:** Should `INITIAL_PASSWORD.txt` be committed as part of the "snapshot everything except node_modules" instruction, and should moved legacy code continue writing recordings to root `recordings/`?

**Decision:** Do not commit or print `INITIAL_PASSWORD.txt`; keep it ignored and read it only at runtime/test time. Adjust moved legacy server to write recordings to `../recordings` so the preserved root recordings directory remains the active legacy location.

**Reasoning:** The batch explicitly says to read but not log `INITIAL_PASSWORD.txt`, and it contains plaintext credentials. The contract also explicitly says not to move `recordings/`, so the moved legacy server needs a path adjustment if restarted before B6.

**Promotion target:** B1 validation notes; no long-term project rule needed beyond keeping secrets ignored and preserving root recordings until B6.
