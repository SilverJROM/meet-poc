import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';

export function deleteUser(email: string, database: Database.Database = getDb()): boolean {
  const tx = database.transaction((targetEmail: string) => {
    database
      .prepare(
        `DELETE FROM meeting_sessions
         WHERE room_id IN (SELECT id FROM rooms WHERE owner_email = ?)
            OR host_email = ?`,
      )
      .run(targetEmail, targetEmail);
    database.prepare('DELETE FROM rooms WHERE owner_email = ?').run(targetEmail);
    database.prepare('DELETE FROM sessions WHERE email = ?').run(targetEmail);
    database.prepare('DELETE FROM telegram_links WHERE email = ?').run(targetEmail);
    return database.prepare('DELETE FROM users WHERE email = ?').run(targetEmail).changes;
  });
  return tx(email) > 0;
}

export function setUserAdmin(
  email: string,
  isAdmin: boolean,
  database: Database.Database = getDb(),
): boolean {
  return database.prepare('UPDATE users SET is_admin = ?, updated_at = ? WHERE email = ?').run(isAdmin ? 1 : 0, Date.now(), email).changes > 0;
}

export function setUserDisplayName(
  email: string,
  displayName: string,
  database: Database.Database = getDb(),
): boolean {
  return database
    .prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE email = ?')
    .run(displayName, Date.now(), email).changes > 0;
}

export function resetUserPassword(
  email: string,
  passwordHash: string,
  database: Database.Database = getDb(),
): boolean {
  return database
    .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE email = ?')
    .run(passwordHash, Date.now(), email).changes > 0;
}