import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';

export function isSuperuserEmail(email: string, database: Database.Database = getDb()): boolean {
  const row = database
    .prepare('SELECT is_superuser FROM users WHERE email = ?')
    .get(email) as { is_superuser: number } | undefined;
  return row?.is_superuser === 1;
}

export type SuperuserGuardOptions = {
  callerEmail?: string;
  /** Allow the superuser target when caller is the same user (displayName/email/reset only). */
  allowSelf?: boolean;
};

export function isSuperuserTargetBlocked(
  targetEmail: string,
  database: Database.Database = getDb(),
  options: SuperuserGuardOptions = {},
): boolean {
  if (!isSuperuserEmail(targetEmail, database)) return false;
  if (options.allowSelf && options.callerEmail && options.callerEmail === targetEmail) return false;
  return true;
}