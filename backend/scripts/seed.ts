import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { getDb, getRepoRoot, runMigrations } from '../src/db.js';
import { hashPassword } from '../src/lib/passwords.js';

const DEFAULT_EMAIL = 'jrom@silverjrom.app';

function readInitialPassword(repoRoot: string): string | null {
  const passwordPath = path.join(repoRoot, 'INITIAL_PASSWORD.txt');
  if (!fs.existsSync(passwordPath)) return null;
  const lines = fs.readFileSync(passwordPath, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length >= 2 && lines[0].includes('@')) return lines[1];
  return lines[0] || null;
}

export function seedUser(database: Database.Database = getDb(), email = DEFAULT_EMAIL): void {
  runMigrations(database);
  const password = readInitialPassword(getRepoRoot());
  if (!password) throw new Error('INITIAL_PASSWORD.txt is missing or empty');
  const now = Date.now();
  const existing = database.prepare('SELECT email FROM users WHERE email = ?').get(email) as { email: string } | undefined;
  if (existing) {
    database
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE email = ?')
      .run(hashPassword(password), now, email);
    console.log(`Updated password for existing user: ${email}`);
    return;
  }
  database
    .prepare('INSERT INTO users (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(email, hashPassword(password), now, now);
  console.log(`Created new user: ${email}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedUser();
}
