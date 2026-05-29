---
date: 2026-05-28
type: feature
status: done
agent: projcore
qa_verification: 6/6 reqs VERIFIED via per-slice API/DB checks on live backend + cascade test on throwaway fixtures + RBAC 403/401 checks; deployed to voice.silverjrom.app
---

# User maintenance + admin user setup

**JROM verbatim:**
> "can you add on the settings a user maintenance to automatically set a username to use on the calls, ability to change password, emails, link/unlink telegram account. and for me as a superuser/admin add a new tab where i can setup new users."
> "have silverjrom and jrom both superusers"

**Scope:** R1 username/display-name · R2 change password · R3 change email (cascade) · R4 telegram link/unlink · R5 admin role (is_admin, seed silverjrom@gmail.com + jrom@silverjrom.app) · R6 admin create-user tab.

**Run:** `plan/WK_0526/user-maintenance/projcore-run-2026-05-28/` (og-requirements, north-star, req-matrix, decisions).
