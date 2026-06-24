# Batch B2a — Changes

## Summary

Backend slice for concealed superuser tier: migration + `requireSuperuser` middleware + admin delete/toggle + god-mode edit/reset endpoints + shared `isSuperuserTargetBlocked` guard.

## Files

### `backend/migrations/0015_superuser.sql` (new)

- Adds `is_superuser INTEGER NOT NULL DEFAULT 0`.
- Seeds `is_superuser=1` for `silverjrom@gmail.com` only.

### `backend/src/modules/auth/sessions.ts`

- `SessionUser` gains `isSuperuser`.
- `getSessionUser` reads `is_superuser` from DB.

### `backend/src/modules/auth/middleware.ts`

- `requireSuperuser` middleware (403 unless `user.isSuperuser`).

### `backend/src/modules/auth/index.ts`

- `/api/me` includes `isSuperuser` on the requester's own user object.

### `backend/src/modules/account/store.ts`

- `changeUserEmail` copies `is_superuser` when cascading email rename.

### `backend/src/modules/admin/guards.ts` (new)

- `isSuperuserEmail`, `isSuperuserTargetBlocked` — defense-in-depth hard-block (R2.6); `allowSelf` for displayName/email/reset.

### `backend/src/modules/admin/store.ts` (new)

- `deleteUser` — FK-safe order: meeting_sessions → rooms → sessions → telegram_links → user.
- `setUserAdmin`, `setUserDisplayName`, `resetUserPassword`.

### `backend/src/modules/admin/index.ts`

- `DELETE /admin/users/:email` (requireAdmin)
- `PATCH /admin/users/:email/role` (requireAdmin)
- `PATCH /admin/users/:email` displayName (requireSuperuser)
- `PATCH /admin/users/:email/email` (requireSuperuser, reuses `changeUserEmail`)
- `POST /admin/users/:email/reset-password` (requireSuperuser)
- List payload unchanged — no `isSuperuser` field (R2.5).

### `backend/tests/admin-superuser.test.ts` (new)

- 7 tests covering R2.1–R2.8 acceptance paths; asserts `403` status codes.