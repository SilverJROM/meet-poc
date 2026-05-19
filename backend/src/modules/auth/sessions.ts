import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  email: string;
};

export function createSession(email: string, database: Database.Database = getDb()): string {
  const token = crypto.randomBytes(32).toString('hex');
  database
    .prepare('INSERT INTO sessions (token, email, expires_at) VALUES (?, ?, ?)')
    .run(token, email, Date.now() + SESSION_TTL_MS);
  return token;
}

export function getSessionUser(token: string | undefined, database: Database.Database = getDb()): SessionUser | null {
  if (!token) return null;
  const session = database
    .prepare('SELECT token, email, expires_at FROM sessions WHERE token = ?')
    .get(token) as { token: string; email: string; expires_at: number } | undefined;
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    database.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  const user = database
    .prepare('SELECT email FROM users WHERE email = ?')
    .get(session.email) as SessionUser | undefined;
  return user ?? null;
}

export function destroySession(token: string | undefined, database: Database.Database = getDb()): void {
  if (!token) return;
  database.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}
