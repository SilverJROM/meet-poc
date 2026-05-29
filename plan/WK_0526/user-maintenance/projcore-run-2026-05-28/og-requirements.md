# og-requirements — User Maintenance + Admin User Setup

Source: JROM chat request 2026-05-28 (verbatim):
> "can you add on the settings a user maintenance to automatically set a username to use on the calls, ability to change password, emails, link/unlink telegram account. and for me as a superuser/admin add a new tab where i can setup new users."
> "have silverjrom and jrom both superusers"

Contract. Acceptance = each requirement observable in the running app on voice.silverjrom.app.

| Req# | Requirement |
|------|-------------|
| R1 | An authenticated user has a persisted **username/display name** used as their name on calls. It auto-defaults to the email local-part on first use, is editable from Settings, and is used as the default join name (no manual re-typing each call). |
| R2 | An authenticated user can **change their password** from Settings — must verify the current password, then set a new one. Wrong current password is rejected. |
| R3 | An authenticated user can **change their email** from Settings. The change cascades atomically across users + sessions + rooms + telegram_links so the account, its rooms, and its Telegram link all follow the new email. The current session remains valid. |
| R4 | An authenticated user can see their **Telegram link status** in Settings (linked handle or "not linked") and **unlink** (deletes the link). Linking is initiated via `/link` in the bot (instructions shown). |
| R5 | A **superuser/admin** role exists (`is_admin` flag). `silverjrom@gmail.com` and `jrom@silverjrom.app` are seeded as admins. Admin-only UI (a new tab) is visible only to admins; non-admins cannot reach it or its APIs. |
| R6 | An admin can **create new users** from the admin tab: email + initial password (shown once), optionally a username and admin flag. The new user can log in immediately and later change their own password (R2). |

## Out of scope (this run)
- Email-based password reset / invitations (no mail transport exists).
- Self-service signup (admin-created only).
- Per-user account deletion UI (not requested).
