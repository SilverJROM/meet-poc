import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { getDb, getRepoRoot } from '../../db.js';

export type UserBackground = {
  id: string;
  label: string;
  mime: string;
  ext: string;
  sizeBytes: number;
  createdAt: number;
};

type Row = {
  id: string;
  owner_email: string;
  label: string;
  mime: string;
  ext: string;
  size_bytes: number;
  created_at: number;
};

export const NON_ADMIN_QUOTA_BYTES = 100 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
};

export function backgroundsDir(): string {
  const dir = process.env.MEET_BACKGROUNDS_DIR || path.join(getRepoRoot(), 'data', 'backgrounds');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function extForMime(mime: string): string | null {
  return MIME_EXT[mime.toLowerCase()] ?? null;
}

function toBackground(row: Row): UserBackground {
  return { id: row.id, label: row.label, mime: row.mime, ext: row.ext, sizeBytes: row.size_bytes, createdAt: row.created_at };
}

export function listBackgrounds(email: string, database: Database.Database = getDb()): UserBackground[] {
  return database
    .prepare('SELECT id, owner_email, label, mime, ext, size_bytes, created_at FROM user_backgrounds WHERE owner_email = ? ORDER BY created_at DESC')
    .all(email)
    .map((r) => toBackground(r as Row));
}

export function usedBytes(email: string, database: Database.Database = getDb()): number {
  const row = database
    .prepare('SELECT COALESCE(SUM(size_bytes), 0) AS total FROM user_backgrounds WHERE owner_email = ?')
    .get(email) as { total: number };
  return row.total;
}

export function getBackgroundRow(id: string, database: Database.Database = getDb()): Row | null {
  return (database
    .prepare('SELECT id, owner_email, label, mime, ext, size_bytes, created_at FROM user_backgrounds WHERE id = ?')
    .get(id) as Row | undefined) ?? null;
}

export function backgroundFilePath(id: string, ext: string): string {
  return path.join(backgroundsDir(), `${id}.${ext}`);
}

export type CreateResult =
  | { ok: true; background: UserBackground }
  | { ok: false; status: 400 | 413; error: string };

export function createBackground(
  email: string,
  isAdmin: boolean,
  label: string,
  mime: string,
  bytes: Buffer,
  database: Database.Database = getDb(),
): CreateResult {
  const ext = extForMime(mime);
  if (!ext) return { ok: false, status: 400, error: 'unsupported image type' };
  if (!bytes.length) return { ok: false, status: 400, error: 'empty image' };
  if (!isAdmin) {
    const used = usedBytes(email, database);
    if (used + bytes.length > NON_ADMIN_QUOTA_BYTES) {
      return { ok: false, status: 413, error: 'storage quota exceeded (100MB)' };
    }
  }
  const id = crypto.randomBytes(9).toString('hex');
  const now = Date.now();
  const cleanLabel = (label || 'Background').slice(0, 64).trim() || 'Background';
  fs.writeFileSync(backgroundFilePath(id, ext), bytes);
  database
    .prepare('INSERT INTO user_backgrounds (id, owner_email, label, mime, ext, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, email, cleanLabel, mime, ext, bytes.length, now);
  return { ok: true, background: { id, label: cleanLabel, mime, ext, sizeBytes: bytes.length, createdAt: now } };
}

export function deleteBackground(id: string, email: string, database: Database.Database = getDb()): boolean {
  const row = getBackgroundRow(id, database);
  if (!row || row.owner_email.toLowerCase() !== email.toLowerCase()) return false;
  try {
    fs.unlinkSync(backgroundFilePath(row.id, row.ext));
  } catch {
    // File may already be gone; the DB row is the source of truth.
  }
  database.prepare('DELETE FROM user_backgrounds WHERE id = ?').run(id);
  return true;
}
