import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';

type UserRow = {
  email: string;
  password_hash: string;
  created_at: number;
  updated_at: number;
  display_name: string | null;
  is_admin: number;
  is_superuser: number;
};

export type EmailChangeResult =
  | { ok: true }
  | { ok: false; status: 400 | 401 | 404 | 409; error: string };

/**
 * Change a user's email, cascading the new value across every table that
 * references it. The user's email is the PK, so we copy the row to the new
 * email, repoint all children, then delete the old (now childless) row — this
 * is FK-safe with foreign_keys=ON and does NOT trip the ON DELETE CASCADE
 * children (questions, llm_settings, meeting_session_diagnostics) because they
 * are repointed before the old row is deleted.
 */
export function changeUserEmail(
  oldEmail: string,
  newEmail: string,
  database: Database.Database = getDb(),
): EmailChangeResult {
  const user = database
    .prepare('SELECT email, password_hash, created_at, updated_at, display_name, is_admin, is_superuser FROM users WHERE email = ?')
    .get(oldEmail) as UserRow | undefined;
  if (!user) return { ok: false, status: 404, error: 'user not found' };

  const existing = database.prepare('SELECT 1 FROM users WHERE email = ?').get(newEmail);
  if (existing) return { ok: false, status: 409, error: 'email already in use' };

  const tx = database.transaction(() => {
    database
      .prepare(
        'INSERT INTO users (email, password_hash, created_at, updated_at, display_name, is_admin, is_superuser) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(newEmail, user.password_hash, user.created_at, Date.now(), user.display_name, user.is_admin, user.is_superuser);
    database.prepare('UPDATE sessions SET email = ? WHERE email = ?').run(newEmail, oldEmail);
    database.prepare('UPDATE rooms SET owner_email = ? WHERE owner_email = ?').run(newEmail, oldEmail);
    database.prepare('UPDATE questions SET owner_email = ? WHERE owner_email = ?').run(newEmail, oldEmail);
    database.prepare('UPDATE llm_settings SET owner_email = ? WHERE owner_email = ?').run(newEmail, oldEmail);
    database.prepare('UPDATE meeting_sessions SET host_email = ? WHERE host_email = ?').run(newEmail, oldEmail);
    database
      .prepare('UPDATE meeting_session_diagnostics SET owner_email = ? WHERE owner_email = ?')
      .run(newEmail, oldEmail);
    database.prepare('UPDATE telegram_links SET email = ? WHERE email = ?').run(newEmail, oldEmail);
    database.prepare('UPDATE user_backgrounds SET owner_email = ? WHERE owner_email = ?').run(newEmail, oldEmail);
    database.prepare('DELETE FROM users WHERE email = ?').run(oldEmail);
  });
  tx();
  return { ok: true };
}
