import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach } from 'vitest';
import { closeDb, getDb, getRepoRoot, runMigrations } from '../src/db.js';

const testRoots: string[] = [];

export function createTestDb(): Database.Database {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meet-poc-test-'));
  testRoots.push(dir);
  const dbPath = path.join(dir, 'test.sqlite');
  process.env.MEET_DB_PATH = dbPath;
  const db = getDb(dbPath);
  runMigrations(db);
  return db;
}

export function initialPassword(): string {
  const lines = fs
    .readFileSync(path.join(getRepoRoot(), 'INITIAL_PASSWORD.txt'), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length >= 2 && lines[0].includes('@')) return lines[1];
  return lines[0];
}

afterEach(() => {
  closeDb();
  delete process.env.MEET_DB_PATH;
  for (const root of testRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
