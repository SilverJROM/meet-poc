import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const defaultDbPath = path.join(repoRoot, 'data', 'meet-poc.sqlite');
const migrationsDir = path.resolve(__dirname, '../migrations');

let db: Database.Database | null = null;
let activePath: string | null = null;

export function getDb(dbPath = process.env.MEET_DB_PATH || defaultDbPath): Database.Database {
  if (db && activePath === dbPath) return db;
  if (db) db.close();

  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  activePath = dbPath;
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  return db;
}

export function closeDb(): void {
  if (db) db.close();
  db = null;
  activePath = null;
}

export function runMigrations(database = getDb()): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  const applied = new Set(
    database.prepare('SELECT name FROM _migrations').all().map((row) => (row as { name: string }).name),
  );
  const files = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
    : [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const apply = database.transaction(() => {
      database.exec(sql);
      database.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
    });
    apply();
  }
}

export function countUsers(database = getDb()): number {
  const row = database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  return row.count;
}

export function getRepoRoot(): string {
  return repoRoot;
}
