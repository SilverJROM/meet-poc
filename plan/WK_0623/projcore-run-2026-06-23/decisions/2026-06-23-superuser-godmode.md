---
date: 2026-06-23
slug: superuser-godmode
source: projcore
issue: "#2 — concealed superuser god mode + complete admin powers"
status: locked-by-JROM (interview 2026-06-23)
---

# Decision — Concealed superuser ("god mode") + admin powers

## JROM's verbatim ask
> "add a superuser w/c is me silverjrom and i want to be able to edit the role, email, username of the
> users (basically god mode on the app). admin can just add/delete users or make other users admin as well,
> god mode has all powers. and from the perspective of the admin or superuser is just admin, only superuser
> knows he is super user. i can reset passwords as well as superuser"

Interview answers (2026-06-23):
1. Superuser = **only `silverjrom@gmail.com`, for now** (singular, seeded, NOT grantable via UI).
2. Power split (table below): **OK as proposed.**
3. **"im greyed out no one should be able to touch me, i appear admin but is greyed out"** — superuser's
   row shows role **"Admin"** but the row is **greyed/disabled** so no one (not even other admins) can
   edit/delete/demote him. Backend hard-blocks every destructive/edit action targeting the superuser.
4. **Email editing: yes** (reuse existing cascade — see below).
5. Self-change **allowed but requires confirmation**; **changing others also requires confirmation.** All
   god-mode mutations go through a confirm step.

## Current state (investigated)
- Single `is_admin` INTEGER flag (migration 0010). Migration comments call silverjrom + jrom "superusers"
  but functionally they're plain admins — **no superuser tier exists.**
- `backend/src/modules/admin/index.ts` implements ONLY: list users, create user, diagnostics toggle.
- **Missing entirely:** delete user, toggle admin, edit username/email/role, reset password.
- Email-rename cascade **already exists** in `backend/src/modules/account/store.ts` (transaction updates
  sessions, rooms, questions, llm_settings, meeting_sessions, meeting_session_diagnostics, telegram_links,
  user_backgrounds, then deletes old row). **Reuse it** for god-mode email edit.

## Locked decisions

**D2-1. Superuser tier = singular, seeded, non-grantable.**
Add `is_superuser` INTEGER flag (migration), seed `=1` for `silverjrom@gmail.com` only. No UI path creates
or grants superuser. (Future multi-superuser is out of scope for this run.)

**D2-2. Power split.**
| Power | Admin | Superuser |
|---|---|---|
| Create user | ✅ | ✅ |
| Delete user | ✅ | ✅ |
| Toggle another user's admin on/off | ✅ | ✅ |
| Edit username (display name) | ❌ | ✅ |
| Edit email (cascade rename) | ❌ | ✅ |
| Edit role beyond admin toggle | ❌ | ✅ |
| Reset password | ❌ | ✅ |

**D2-3. Concealment.** `is_superuser` is **never serialized to other users' clients.** Only the requesting
user's own session learns their own superuser status (to render god-mode controls). The role column shows
**"Admin"** for the superuser to everyone. No "Superuser" label anywhere.

**D2-4. Protection (greyed + hard-block).** In the admin UI, the superuser's row renders **greyed/disabled**
— no action controls enabled against it — for ALL viewers (including other admins, who can't tell why
beyond "it's greyed"). The backend independently **hard-blocks** any delete / demote / edit / password-reset
whose target is the superuser, regardless of caller (defense in depth — UI greying is cosmetic; the server
is the real gate). The only actor who can modify the superuser is the superuser himself.

**D2-5. Confirmation on every god-mode mutation.** Editing role/email/username or resetting a password —
on self OR others — requires an explicit confirm dialog before the call fires.

**D2-6. Self-lockout guards.** Superuser cannot remove his own superuser status through the UI. Self
email-change requires confirmation (D2-5) and is the only self-mutation that cascades.

**D2-7. Authorization middleware.** Add `requireSuperuser` alongside `requireAdmin`. God-mode endpoints use
`requireSuperuser`; add/delete/admin-toggle use `requireAdmin` PLUS a target-is-not-superuser guard.

## Notes / risks
- Email PK is COLLATE NOCASE; cascade reuse must preserve that.
- Deleting a user must respect existing FK/cleanup (rooms ON DELETE CASCADE etc.) — verify no orphan
  meeting_sessions (no FK there). Mirror the throwaway-room delete-order lesson.
- `jrom@silverjrom.app` is currently also is_admin=1 — it stays a plain admin (NOT superuser) unless JROM
  says otherwise.
