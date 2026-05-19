import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';

export type Room = {
  id: string;
  title: string;
  ownerEmail: string;
  createdAt: number;
};

type RoomRow = {
  id: string;
  title: string;
  owner_email: string;
  created_at: number;
};

function toRoom(row: RoomRow): Room {
  return {
    id: row.id,
    title: row.title,
    ownerEmail: row.owner_email,
    createdAt: row.created_at,
  };
}

export function getRoom(id: string, database: Database.Database = getDb()): Room | null {
  const row = database
    .prepare('SELECT id, title, owner_email, created_at FROM rooms WHERE id = ?')
    .get(id) as RoomRow | undefined;
  return row ? toRoom(row) : null;
}

export function isOwnerOf(roomId: string | null, email: string | null | undefined, database: Database.Database = getDb()): boolean {
  if (!roomId || !email) return false;
  const row = database
    .prepare('SELECT 1 FROM rooms WHERE id = ? AND owner_email = ?')
    .get(roomId, email) as { 1: number } | undefined;
  return !!row;
}

export function listOwnedRooms(email: string, database: Database.Database = getDb()): Room[] {
  return database
    .prepare('SELECT id, title, owner_email, created_at FROM rooms WHERE owner_email = ? ORDER BY created_at DESC')
    .all(email)
    .map((row) => toRoom(row as RoomRow));
}

export function listOwnedRoomsPage(
  email: string,
  page: number,
  pageSize: number,
  database: Database.Database = getDb(),
): { rooms: Room[]; total: number } {
  const offset = (page - 1) * pageSize;
  const totalRow = database
    .prepare('SELECT COUNT(*) AS total FROM rooms WHERE owner_email = ?')
    .get(email) as { total: number };
  const rooms = database
    .prepare('SELECT id, title, owner_email, created_at FROM rooms WHERE owner_email = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(email, pageSize, offset)
    .map((row) => toRoom(row as RoomRow));
  return { rooms, total: totalRow.total };
}

export function createRoom(titleInput: unknown, email: string, database: Database.Database = getDb()): Room {
  const title =
    String(titleInput || '').slice(0, 100).trim() || `Room ${new Date().toISOString().slice(0, 10)}`;
  for (let i = 0; i < 5; i += 1) {
    const id = crypto.randomBytes(6).toString('hex');
    const createdAt = Date.now();
    const result = database
      .prepare('INSERT OR IGNORE INTO rooms (id, title, owner_email, created_at) VALUES (?, ?, ?, ?)')
      .run(id, title, email, createdAt);
    if (result.changes === 1) return { id, title, ownerEmail: email, createdAt };
  }
  throw new Error('failed to create unique room id');
}

export function deleteRoom(id: string, database: Database.Database = getDb()): boolean {
  return database.prepare('DELETE FROM rooms WHERE id = ?').run(id).changes > 0;
}

export function bulkDeleteOwnedRooms(
  ids: string[],
  email: string,
  database: Database.Database = getDb(),
): { deleted: number; requested: number } {
  const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.length > 0)));
  if (unique.length === 0) return { deleted: 0, requested: 0 };
  const placeholders = unique.map(() => '?').join(',');
  const result = database
    .prepare(`DELETE FROM rooms WHERE owner_email = ? AND id IN (${placeholders})`)
    .run(email, ...unique);
  return { deleted: result.changes, requested: unique.length };
}
