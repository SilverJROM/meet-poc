# Batch B2a — Self-Review

## Security

- Hard-block is server-side via `isSuperuserTargetBlocked` on every destructive/edit route touching a superuser target.
- `requireSuperuser` gates god-mode endpoints; plain admins get 403 before reaching handlers.
- `is_superuser` never serialized in `/admin/users` list.
- No endpoint sets `is_superuser` — tier is migration-seeded only.

## Risks / follow-ups (B2b scope)

- Admin UI greyed row + confirm dialogs not in this batch.
- Production migration requires existing `silverjrom@gmail.com` row for seed UPDATE to apply.
- `requireAdmin` still passes for superuser (they retain `is_admin=1`); concealment relies on list mapping only.

## Autonomous decisions

None — followed locked decision doc `2026-06-23-superuser-godmode.md`.