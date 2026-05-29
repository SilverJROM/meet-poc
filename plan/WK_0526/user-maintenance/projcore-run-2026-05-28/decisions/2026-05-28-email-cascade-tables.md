---
date: 2026-05-28
project: meet-poc
type: autonomous-call
source: projcore
priority: high
search_hooks: [email-change, cascade, foreign-key, on-delete-cascade, user-email-migration]
---

# Email-change cascade — full table set + ordering + password gate

NS3 named 4 tables (users, sessions, rooms, telegram_links). A schema sweep found the user's email is referenced by **8** columns:
- `users.email` (PK, NOCASE)
- `sessions.email` (FK)
- `rooms.owner_email` (FK)
- `questions.owner_email` (FK ON DELETE CASCADE)
- `llm_settings.owner_email` (FK ON DELETE CASCADE)
- `meeting_sessions.host_email` (no FK declared, but logically owned)
- `meeting_session_diagnostics.owner_email` (FK ON DELETE CASCADE)
- `telegram_links.email` (FK)

**Decision:** the cascade covers ALL 8. Mechanism = insert new user row (copy) → repoint every child column to the new email → delete the old user row. Because the old row is childless by delete time, the three `ON DELETE CASCADE` children are NOT wiped. FK-safe at every step with `foreign_keys = ON` (no reliance on defer pragma).

**Decision:** changing email **requires the current password** (identity-critical, consistent with password change). Counterfactual: no password gate (frictionless) — rejected as too weak for an identity change. Low-regret: stricter than JROM asked.

This realizes the cascade DECISION from NS3 faithfully; only the table list was wider than NS3's example. Not a north-star amendment — a completeness correction.
