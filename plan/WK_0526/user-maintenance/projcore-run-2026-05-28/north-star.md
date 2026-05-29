# north-star — User Maintenance + Admin (locked 2026-05-28)

Frontloaded answers from JROM. Append-only.

## NS1 — Lifecycle (FIRST anchor)
**pre-live, deferral OFF.** No TODO/FIXME, no "follow-up PR", no dead-code shims. Everything in scope ships complete this run or it's a blocker.

## NS2 — Admin grant
Add `is_admin` boolean column to `users`. Seed **BOTH** `silverjrom@gmail.com` and `jrom@silverjrom.app` as admins via migration. Admin tab + admin APIs gated on `is_admin`. Extensible (admin can mark others admin at creation per R6).

## NS3 — Email change mechanism
Email stays the primary key. Changing it **cascade-updates** `users` → `sessions` → `rooms` → `telegram_links` in **one transaction**. Current session stays valid (the cascade updates the session row's email too). (JROM picked cascade over surrogate-id refactor and over force-relogin.)

## NS4 — New-user password
Admin **types the initial password** in the create form; it is shown once for the admin to relay. User can change it later via R2. (No force-change-on-first-login.)

## NS5 — Telegram in settings
Settings shows link **status** (linked @handle / not linked) + an **Unlink** button (deletes the `telegram_links` row). Linking is still initiated by `/link` in the bot — settings shows instructions. No in-settings token entry.

## NS6 — Username default
Persisted `display_name` column. Defaults to email local-part (backfilled for existing users + auto-set for new). Editable in Settings. Used as the default join name for authenticated users (replaces the ad-hoc `email.split('@')[0]` in room.page).

## NS7 — Execution
Claude builds directly in this session, batch-gated (NOT canonical codex-in-tmux projcore — no separate implementer). Per-slice: implement → build → deploy → verify on live URL → matrix update → next.

## NS8 — Scope
LOCAL + deploy to voice.silverjrom.app (PM2 restart per project_specs §8.3) so each slice is verifiable on the live URL.

## NS9 — Testing
Targeted backend tests where they fit + manual verification on the live URL (curl/API + UI flow). No full e2e capstone.
