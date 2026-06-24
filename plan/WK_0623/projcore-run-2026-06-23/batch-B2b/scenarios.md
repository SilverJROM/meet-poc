# Batch B2b — Scenarios

Requirements: R2.2 R2.3 R2.5 R2.6 R2.7 R2.9 (UI surface)

## S1 — Protected superuser row (concealment + grey UI)

**Given** an admin (non-superuser) session on `/app/admin`  
**And** the user list includes the seeded superuser (`silverjrom@gmail.com`)  
**When** the Users table renders  
**Then** the superuser row shows role **Admin** (not “Superuser”)  
**And** the row has `protected: true` from the list API (no `isSuperuser` field)  
**And** the row is greyed with label **Protected** and zero action buttons

## S2 — Admin delete + toggle-admin on normal users

**Given** an admin session  
**And** a non-protected user row  
**When** admin clicks **Delete** and confirms  
**Then** `DELETE /api/admin/users/:email` succeeds and the row disappears  
**When** admin clicks **Make admin** / **Revoke admin** and confirms (god-mode confirm for superuser)  
**Then** `PATCH /api/admin/users/:email/role` updates `isAdmin`

## S3 — God-mode controls (superuser only)

**Given** a superuser session (`/api/me` → `isSuperuser === true`)  
**And** a non-protected target user  
**When** the Users table renders  
**Then** god-mode buttons appear: **Username**, **Email**, **Role**, **Reset password**  
**And** regular admins viewing the same page do **not** see those buttons

## S4 — Confirm on every god-mode mutation

**Given** a superuser session  
**When** superuser initiates a god-mode action (e.g. edit username after prompt)  
**Then** an in-page **Confirm action** dialog appears before the API call  
**And** cancel dismisses without mutation

## S5 — No regression

**Given** existing flows  
**Then** login, `/api/me`, and create-user on the admin page still work  
**And** protected-row action attempts are blocked client-side; server returns 403 if forced