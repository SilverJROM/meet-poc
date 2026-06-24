# Batch B2a — Scenarios

| ID | Requirement | Scenario | Expected |
|---|---|---|---|
| S1 | R2.1 | Migration `0015_superuser.sql` on DB with `silverjrom@gmail.com` | `is_superuser=1` for that row only; no API grants it |
| S2 | R2.5 | Superuser calls `GET /api/me` | `user.isSuperuser: true` |
| S3 | R2.5 | Admin calls `GET /api/me` | `user.isSuperuser: false` |
| S4 | R2.5 | Admin calls `GET /api/admin/users` | No `isSuperuser` / `is_superuser` in payload; superuser row shows `isAdmin: true` |
| S5 | R2.2 | Admin deletes normal user | `200 {ok:true}`; user + owned rooms/sessions gone |
| S6 | R2.2 | Admin toggles `isAdmin` on normal user | `200`; DB reflects toggle |
| S7 | R2.6 | Admin deletes superuser | `403` |
| S8 | R2.6 | Admin demotes superuser (`PATCH .../role`) | `403` |
| S9 | R2.4 | Admin calls god-mode endpoints (displayName/email/reset) | `403` |
| S10 | R2.3 | Superuser edits displayName, email (cascade), role, password on another user | `200`; cascade repoints rooms/telegram; login works with new password |
| S11 | R2.8 | Superuser self email-change | `200`; `is_superuser` preserved on new email |
| S12 | R2.8 | Superuser self role demote | `403` |
| S13 | R2.6 | Superuser self displayName edit | `200` |