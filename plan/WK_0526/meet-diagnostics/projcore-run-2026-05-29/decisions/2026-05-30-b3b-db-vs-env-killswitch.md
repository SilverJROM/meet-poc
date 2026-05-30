# Decision — B3b global diagnostics kill-switch: DB-backed `app_settings` (not an env var)

Date: 2026-05-30
Batch: B3b (R5)
Decider: [dev] (locked projcore design — recorded here for the audit trail)

## Decision

The global diagnostics kill-switch flag is stored in a **DB-backed generic KV table**
(`app_settings`, migration `0012_app_settings.sql`, key `diagnostics_globally_enabled`),
read/written through a single store helper
(`backend/src/modules/app-settings/store.ts`). It is **not** an environment variable.

## Why DB, not env var

- **Runtime-flippable with no redeploy.** JROM's requirement: *"so that when we are at a
  certain point we can just off these."* The admin must be able to flip the switch live
  from the admin UI and have it take effect on the very next diagnostics POST. An env var
  would require editing the env + a `pm2 restart` to take effect — that defeats the "just
  off these" live-control intent.
- **Reuses existing infrastructure.** `better-sqlite3` + the `runMigrations` runner
  (`backend/src/db.ts:34`) are already in place; `0012_app_settings.sql` matches the
  existing migration format (idempotent `CREATE TABLE IF NOT EXISTS`). No new dependency,
  no new config surface.
- **Single source of truth.** One store helper is read by the admin GET/PUT routes, the
  diagnostics POST gate, and `/api/me`. An env var would be read in three places and still
  could not be mutated by the admin route at runtime.

## Invariants

- **Absent row ⇒ global ON.** No seed row is written by the migration. The store returns
  `true` when the row is missing (`value !== '0'` contract; absent ⇒ default true).
- **Fail-open.** `getDiagnosticsGloballyEnabled` wraps the read in try/catch and returns
  `true` on ANY error (missing table, DB fault). A store fault never silently kills
  diagnostics. This backs scenario A-8e (store read throws ⇒ `/api/me` still reports
  `diagnosticsGloballyEnabled: true`).
- **Exactly one row.** `setDiagnosticsGloballyEnabled` UPSERTs
  (`INSERT ... ON CONFLICT(key) DO UPDATE`), so repeated writes keep a single row and
  re-stamp `updated_at` (A-3).

## Scope guard

This is a **feature toggle reusing the existing `requireAdmin` middleware** — NOT a new
auth/RBAC boundary (north-star NS8). The `app_settings` table is generic KV, but the
admin routes + UI are scoped to the diagnostics flag only; no general settings editor was
added. No live WS/SSE push to in-call clients — the backend POST gate is the authoritative
kill (mid-session flip documented as intentional in scenarios C-2).
