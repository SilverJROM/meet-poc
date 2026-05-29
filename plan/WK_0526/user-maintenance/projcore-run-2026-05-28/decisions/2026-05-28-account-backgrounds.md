---
date: 2026-05-28
project: meet-poc
type: autonomous-call
source: projcore
priority: high
search_hooks: [account-backgrounds, custom-background, upload, quota, filesystem-storage, email-cascade]
---

# Account-backed backgrounds — design decisions

JROM frontload: 20MB **total** quota (non-admin), admins unlimited; resize to 720p before storing; new Backgrounds Settings tab; picker select-only for accounts; **guests keep localStorage** (registered-only feature).

- **Storage:** filesystem (`data/backgrounds/<id>.<ext>`, gitignored) + `user_backgrounds` metadata table. Mirrors the recordings precedent (convention conformance, ALWAYS-OK). Files keyed by random id (NOT email) so an email change needs no file move — only a DB repoint.
- **Upload transport:** JSON `{label, dataUrl}` with a 30mb route-level body limit (global is 1mb). Client resizes to 720p webp first, so payloads are small; quota is enforced server-side on stored bytes.
- **Quota:** non-admin total ≤ 20MB enforced in `createBackground` (used + new > cap → 413). Admins unlimited (`quota: null`).
- **Image serve:** `GET /api/account/backgrounds/:id/image`, owner-scoped, cookie auth (works for `<img src>` same-origin). `Cache-Control: private`.
- **Email cascade (extends B4 / 2026-05-28-email-cascade-tables.md):** `user_backgrounds.owner_email` is the **9th** table added to `changeUserEmail`. This is the exact "future FK forgotten" risk NS3 flagged recurring — caught because every new user-linked table is checked against the cascade. ON DELETE CASCADE on this table → repointed before delete-old (existing safe ordering).
- **Picker:** signed-in users load account backgrounds (`acct:<id>` ids, select-only, no upload tile); guests keep the localStorage custom-upload path unchanged.
