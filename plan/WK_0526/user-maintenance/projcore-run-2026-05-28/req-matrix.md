# req-matrix — User Maintenance + Admin

Statuses: UNASSIGNED → ASSIGNED → IN-PROGRESS → CLAIMED → VERIFIED (or FAIL)

| Req# | Requirement (first 80 chars) | Slice | Evidence | Status |
|------|------------------------------|-------|----------|--------|
| R5a | is_admin flag + display_name column; seed both admins; /api/me exposes them | B1 | login+/api/me return displayName+isAdmin; DB: both cols, backfilled, both admins seeded | VERIFIED |
| R1 | Persisted username/display_name used as call name; defaults to local-part; editable | B2 | PUT display-name persists; /me reflects; empty→400; room join defaults to user.displayName; Settings Account card | VERIFIED |
| R2 | Change password (verify current, set new) | B3 | curl on throwaway user: wrong-current→401, short→400, correct→200, old pw stops working, new pw logs in; Settings password card | VERIFIED |
| R3 | Change email (cascade across users+sessions+rooms+telegram_links) | B4 | throwaway user w/ room+tg+meeting_session+2 sessions: change→all 8 tables repointed, old user gone, session stayed valid, wrong-pw→401; Settings email card | VERIFIED |
| R4 | Telegram link status + unlink; link via bot | B5 | status false→linked(seed)→unlink removed:1→false; DB 0 rows; Settings Telegram card w/ status+Unlink+bot instructions | VERIFIED |
| R5 | Admin-only tab gated on is_admin; non-admins blocked | B6 | non-admin→403, unauth→401 on /admin/users (API-gated); admin nav tab computed on isAdmin; route adminGuard | VERIFIED |
| R6 | Admin creates users (email + initial pw, optional username + admin) | B6 | admin create→200, new user logs in, duplicate→409, short pw→400; admin page create form + user list | VERIFIED |
| R7 | Signed-in user joins a meeting by code as their own account (no guest name) | B9 | /join identity-aware: signed-in→'Joining as <username>', no name field, routes /room/<slug> w/ session identity; logged-out guest flow unchanged; bundle+build verified, live 200 | VERIFIED |
| R8 | (injected UI) Settings sub-tabs Account/LLM/Transcribe; admin list shows linked TG username | B7,B8 | tabs compiled in bundle; admin /users returns telegramUsername (silverjrom→@silverJROM) | VERIFIED |
| R9 | Account-backed backgrounds: registered users upload/delete on account, cross-device, 20MB total quota (non-admin), admins unlimited; guests keep localStorage | B10,B11,B12 | CRUD+serve curl OK; non-admin over-quota→413; admin unlimited; Settings Backgrounds tab + picker account-bg wiring in bundle; user_backgrounds added to email cascade | VERIFIED |

## Queue (atomic slices, dependency-ordered)
- **B1** — Foundation: migration (`display_name`, `is_admin`), seed admins, backfill display_name, expose in `/api/me`. (R5a)
- **B2** — Username maintenance: `PUT /api/account/display-name` + Settings UI; room join uses stored display_name. (R1)
- **B3** — Change password: `PUT /api/account/password` (verify current) + Settings UI. (R2)
- **B4** — Change email: `PUT /api/account/email` (cascade txn) + Settings UI. (R3)
- **B5** — Telegram link status + unlink: account status + `DELETE /api/telegram/link` + Settings UI. (R4)
- **B6** — Admin tab + create user: admin guard, `POST/GET /api/admin/users`, admin-only nav + page. (R5, R6)
