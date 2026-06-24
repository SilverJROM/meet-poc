# Batch B2b — Changes

## Summary

Admin UI for concealed superuser god-mode: `protected` list flag, greyed untouchable row, admin delete/toggle-admin, superuser-only god-mode controls, styled confirm dialog on mutations.

## Backend (minimal)

### `backend/src/modules/admin/index.ts`

- List payload adds `protected: isSuperuserEmail(u.email)` — concealment-safe; never exposes `isSuperuser`.

### `backend/tests/admin-superuser.test.ts`

- Asserts `protected: true` on superuser list row; `false` on normal admin row.

## Frontend

### `frontend/src/app/services/auth.service.ts`

- `User` type + login/me handling for optional `isSuperuser` (own session only).

### `frontend/src/app/services/admin.service.ts`

- `protected` on `AdminUser`.
- Client methods: `deleteUser`, `setUserAdmin`, `setDisplayName`, `changeEmail`, `resetPassword`.

### `frontend/src/app/pages/admin/admin.page.{ts,html,scss}`

- Actions column: delete + toggle-admin (all admins, non-protected rows).
- God-mode row actions (superuser only): username, email, role, reset password.
- Protected rows: grey styling, **Protected** label, no controls.
- In-page confirm modal (leave-dialog pattern) before god-mode mutations and delete; `window.prompt` for input values.

## E2E / UI proof

### `e2e/tests/b2b-admin-ui/admin-ui.spec.ts` (new)

- Seeds B2B test users; captures screenshots.

Screenshots:

- `batch-B2b/screenshots/admin-protected-row.png`
- `batch-B2b/screenshots/god-mode-confirm.png`