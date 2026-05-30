import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';

/**
 * Global diagnostics kill-switch (R5 / B3b).
 *
 * Single source of truth for the DB-backed `app_settings` flag that gates whether
 * the backend accepts/persists diagnostics AND whether clients keep collecting
 * (the value is surfaced on /api/me). Read by the admin GET/PUT routes, the
 * diagnostics POST gate, and /api/me. Written only by the admin PUT route.
 *
 * Contract:
 *   - row absent        -> true  (default ON — no seed row)
 *   - value exactly '0' -> false (explicitly disabled)
 *   - any other value   -> true
 *   - any read error     -> true (fail-open)
 */
export const DIAGNOSTICS_GLOBALLY_ENABLED_KEY = 'diagnostics_globally_enabled';

/**
 * Returns whether diagnostics are globally enabled. Defaults to true (ON) when
 * the row is absent or the value is anything other than '0'. FAIL-OPEN: any
 * error (e.g. missing table / DB fault) returns true so a store fault never
 * silently kills diagnostics.
 */
export function getDiagnosticsGloballyEnabled(database: Database.Database = getDb()): boolean {
  try {
    const row = database
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(DIAGNOSTICS_GLOBALLY_ENABLED_KEY) as { value: string } | undefined;
    if (!row) return true;
    return row.value !== '0';
  } catch {
    return true;
  }
}

/**
 * Persists the global diagnostics flag via UPSERT so there is exactly one row:
 * false -> stores '0' (read returns false); true -> stores '1' (read returns
 * true). Always stamps updated_at with the current time.
 */
export function setDiagnosticsGloballyEnabled(enabled: boolean, database: Database.Database = getDb()): void {
  database
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(DIAGNOSTICS_GLOBALLY_ENABLED_KEY, enabled ? '1' : '0', Date.now());
}
