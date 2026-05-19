import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { getDb, getRepoRoot, runMigrations } from '../src/db.js';

type LegacyUser = {
  email: string;
  passwordHash: string;
  createdAt?: number;
  updatedAt?: number;
};

type LegacySession = {
  email: string;
  expiresAt: number;
};

type LegacyData = {
  users?: LegacyUser[];
  sessions?: Record<string, LegacySession>;
};

export function migrateFromJson({
  jsonPath = path.join(getRepoRoot(), 'legacy-poc', 'data.json'),
  database = getDb(),
}: {
  jsonPath?: string;
  database?: Database.Database;
} = {}): void {
  runMigrations(database);
  if (!fs.existsSync(jsonPath)) return;

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as LegacyData;
  const now = Date.now();
  const insertUser = database.prepare(`
    INSERT INTO users (email, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO NOTHING
  `);
  const insertSession = database.prepare(`
    INSERT INTO sessions (token, email, expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(token) DO NOTHING
  `);

  const migrate = database.transaction(() => {
    for (const user of raw.users || []) {
      insertUser.run(user.email, user.passwordHash, user.createdAt || now, user.updatedAt || user.createdAt || now);
    }
    for (const [token, session] of Object.entries(raw.sessions || {})) {
      const user = database.prepare('SELECT email FROM users WHERE email = ?').get(session.email);
      if (user) insertSession.run(token, session.email, session.expiresAt);
    }
  });
  migrate();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const jsonPath = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
  migrateFromJson({ jsonPath });
  console.log('Legacy JSON migration complete');
}
