---
date: 2026-05-28
project: meet-poc (voice.silverjrom.app)
type: frontloaded-decisions
source: projcore
priority: high
search_hooks: [user-maintenance, admin, superuser, is_admin, email-change, display-name, telegram-unlink, settings]
---

# User Maintenance + Admin — frontloaded design decisions

JROM answered a Phase-0 batched interview. Locked into north-star.md.

- **Admin grant (R5):** `is_admin` DB flag; seed BOTH `silverjrom@gmail.com` and `jrom@silverjrom.app`. (ALWAYS-ESCALATE: RBAC — JROM decided.) Counterfactual default would have been single hardcoded admin.
- **Email change (R3):** cascade-update across users+sessions+rooms+telegram_links in one transaction; email stays PK; session stays valid. (ALWAYS-ESCALATE: PK/FK data-safety — JROM decided.) Counterfactual: introduce surrogate user id (rejected as too large), or force re-login (rejected).
- **New-user password (R6):** admin types initial password, shown once; no forced change. Counterfactual: auto-generate.
- **Telegram (R4):** settings shows status + Unlink; linking still via `/link` in bot. Counterfactual: full in-settings linking (rejected as more surface).
- **Username (R1):** persisted `display_name`, defaults to email local-part, editable, used as default join name.
- **Execution (NS7):** Claude builds in-session batch-gated (not codex-in-tmux). JROM explicitly chose speed over canonical projcore. NOTE: with Claude as builder this is `/lead`-style, not strict projcore (projcore never implements) — proceeding per JROM's explicit instruction.
- **Lifecycle:** pre-live, deferral OFF. **Scope:** LOCAL + deploy to live. **Testing:** targeted + manual on live URL.
