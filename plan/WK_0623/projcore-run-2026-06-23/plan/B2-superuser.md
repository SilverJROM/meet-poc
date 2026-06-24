# Batch plan — B2: Concealed superuser + admin powers

> Gated: no implementation until JROM's post-call "go". Atomic tasks (<30min). Verifier ≠ fixer.
> Covers req-matrix R2.1–R2.9. Decision: `decisions/2026-06-23-superuser-godmode.md`.

## Affected surfaces
- `backend/migrations/0015_superuser.sql` (new) — `is_superuser` column + seed silverjrom.
- `backend/src/modules/admin/index.ts` — add delete/admin-toggle (admin) + edit-username/email/role +
  password-reset (superuser); add target-is-superuser guard.
- `backend/src/modules/auth/middleware.ts` — add `requireSuperuser`.
- `backend/src/modules/auth/sessions.ts` — include `isSuperuser` ONLY in the requester's own session user.
- `backend/src/modules/account/store.ts` — reuse `changeEmail` cascade for god-mode email edit.
- `frontend/src/app/pages/admin/*` — god-mode edit controls (superuser only), greyed superuser row,
  confirm dialogs.
- `frontend/src/app/services/*` (admin/account service) — new client calls.

## Tasks (atomic)

**B2-T1 — Migration + seed.** `is_superuser INTEGER NOT NULL DEFAULT 0`; `UPDATE … =1 WHERE email='silverjrom@gmail.com'`. (R2.1)
Test: migration applies; silverjrom is_superuser=1, others 0.

**B2-T2 — `requireSuperuser` middleware + self session flag.** Add middleware; surface `isSuperuser` on the
**requester's own** session user only (never in the /admin/users list payload). (R2.5, R2.7-infra)
Test: superuser session sees own flag; admin list response has no is_superuser field.

**B2-T3 — Admin: delete user.** `DELETE /admin/users/:email` (requireAdmin) + **guard: target not
superuser** → 403. Respect FK/cleanup (delete meeting_sessions for owned rooms first, mirror known
delete-order lesson). (R2.2, R2.6)
Test: admin deletes a normal user; admin deleting superuser → 403.

**B2-T4 — Admin: toggle admin.** `PATCH /admin/users/:email/role { isAdmin }` (requireAdmin) + superuser-target
guard. (R2.2, R2.6)
Test: promote/demote a normal user; targeting superuser → 403.

**B2-T5 — Superuser: edit username.** `PATCH /admin/users/:email { displayName }` (requireSuperuser). (R2.3)
Test: rename reflected; admin (non-super) → 403 (R2.4).

**B2-T6 — Superuser: edit email (cascade).** `PATCH /admin/users/:email/email { newEmail }` (requireSuperuser)
reusing `changeEmail`. Self email-change allowed but flagged for confirm (R2.8). (R2.3)
Test: email rename cascades (rooms/sessions/telegram_links/etc.); old email gone; login works on new email.

**B2-T7 — Superuser: reset password.** `POST /admin/users/:email/reset-password { newPassword }`
(requireSuperuser). Hash via `hashPassword`. (R2.3) Test: target logs in with new password; admin → 403 (R2.4).

**B2-T8 — Superuser-self guards.** Block self-demote of superuser status via any endpoint; require confirm
semantics surfaced to UI. (R2.8) Test: self-demote attempt → 403/blocked.

**B2-T9 — Admin UI: god-mode controls + greyed row + confirms.** Superuser-only edit controls (role/email/
username/reset); superuser row greyed/disabled for all; confirm dialog on every god-mode mutation. (R2.5, R2.6, R2.7)
Test (rendered): admin view shows greyed superuser row + no god controls; superuser view shows controls + confirms.

**B2-T10 — Capstone validation.** Independent projcore pass: concealment (payload), protection (API rejects
all super-targeting from an admin), god-mode happy paths + confirms, no auth/login/room-ownership regression. (R2.9)

## Sequencing
T1→T2 first (tier + auth infra). T3–T4 (admin powers) and T5–T8 (god mode) are parallel-safe after T2.
T9 UI after endpoints exist. T10 capstone last.
