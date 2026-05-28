import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';

export type Room = {
  id: string;
  title: string;
  slug: string;
  ownerEmail: string;
  isOpen: boolean;
  waitTimeoutMinutes: number;
  createdAt: number;
};

type RoomRow = {
  id: string;
  title: string;
  slug: string | null;
  owner_email: string;
  is_open: number;
  wait_timeout_minutes: number;
  created_at: number;
};

type SlugValidationResult =
  | { ok: true; slug: string }
  | { ok: false; error: 'slug invalid' | 'slug reserved' | 'slug too long' };

const MAX_SLUG_LENGTH = 80;
const RESERVED_SLUGS = new Set([
  'api',
  'app',
  'dashboard',
  'health',
  'join',
  'login',
  'ongoing',
  'past',
  'recording',
  'recordings',
  'room',
  'rooms',
  'settings',
  'transcript',
  'transcripts',
  'ws',
]);

function toRoom(row: RoomRow): Room {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug || row.id,
    ownerEmail: row.owner_email,
    isOpen: row.is_open === 1,
    waitTimeoutMinutes: Number(row.wait_timeout_minutes || 15),
    createdAt: row.created_at,
  };
}

export function getRoom(id: string, database: Database.Database = getDb()): Room | null {
  const row = database
    .prepare('SELECT id, title, slug, owner_email, is_open, wait_timeout_minutes, created_at FROM rooms WHERE id = ?')
    .get(id) as RoomRow | undefined;
  return row ? toRoom(row) : null;
}

export function getRoomBySlugOrId(key: string, database: Database.Database = getDb()): Room | null {
  const roomKey = String(key || '').slice(0, MAX_SLUG_LENGTH);
  const bySlug = database
    .prepare('SELECT id, title, slug, owner_email, is_open, wait_timeout_minutes, created_at FROM rooms WHERE slug = ?')
    .get(roomKey) as RoomRow | undefined;
  if (bySlug) return toRoom(bySlug);
  return getRoom(roomKey, database);
}

export function isOwnerOf(roomId: string | null, email: string | null | undefined, database: Database.Database = getDb()): boolean {
  if (!roomId || !email) return false;
  const row = database
    .prepare('SELECT 1 FROM rooms WHERE id = ? AND owner_email = ?')
    .get(roomId, email) as { 1: number } | undefined;
  return !!row;
}

export function listOwnedRooms(email: string, database: Database.Database = getDb(), searchQuery = ''): Room[] {
  const search = normalizeRoomSearch(searchQuery);
  const filter = titleSearchFilter(search);
  return database
    .prepare(`SELECT id, title, slug, owner_email, is_open, wait_timeout_minutes, created_at FROM rooms WHERE owner_email = ?${filter.sql} ORDER BY created_at DESC`)
    .all(email, ...filter.params)
    .map((row) => toRoom(row as RoomRow));
}

export function listOwnedRoomsPage(
  email: string,
  page: number,
  pageSize: number,
  database: Database.Database = getDb(),
  searchQuery = '',
): { rooms: Room[]; total: number } {
  const offset = (page - 1) * pageSize;
  const search = normalizeRoomSearch(searchQuery);
  const filter = titleSearchFilter(search);
  const totalRow = database
    .prepare(`SELECT COUNT(*) AS total FROM rooms WHERE owner_email = ?${filter.sql}`)
    .get(email, ...filter.params) as { total: number };
  const rooms = database
    .prepare(`SELECT id, title, slug, owner_email, is_open, wait_timeout_minutes, created_at FROM rooms WHERE owner_email = ?${filter.sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(email, ...filter.params, pageSize, offset)
    .map((row) => toRoom(row as RoomRow));
  return { rooms, total: totalRow.total };
}

export function createRoom(titleInput: unknown, email: string, database: Database.Database = getDb()): Room {
  const title =
    String(titleInput || '').slice(0, 100).trim() || `Room ${new Date().toISOString().slice(0, 10)}`;
  for (let i = 0; i < 10; i += 1) {
    const id = crypto.randomBytes(6).toString('hex');
    const slug = createAutoSlug(title);
    const createdAt = Date.now();
    const result = database
      .prepare('INSERT OR IGNORE INTO rooms (id, title, slug, owner_email, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, title, slug, email, createdAt);
    if (result.changes === 1) return { id, title, slug, ownerEmail: email, isOpen: false, waitTimeoutMinutes: 15, createdAt };
  }
  throw new Error('failed to create unique room id and slug');
}

export function setRoomAccess(
  roomId: string,
  input: { isOpen?: unknown; waitTimeoutMinutes?: unknown },
  email: string,
  database: Database.Database = getDb(),
): { ok: true; room: Room } | { ok: false; status: 400 | 403 | 404; error: string } {
  const room = getRoom(roomId, database);
  if (!room) return { ok: false, status: 404, error: 'not found' };
  if (!isOwnerOf(room.id, email, database)) return { ok: false, status: 403, error: 'forbidden' };
  const isOpen = typeof input.isOpen === 'boolean' ? input.isOpen : room.isOpen;
  const waitTimeoutMinutes = input.waitTimeoutMinutes == null ? room.waitTimeoutMinutes : Number(input.waitTimeoutMinutes);
  if (!Number.isFinite(waitTimeoutMinutes) || waitTimeoutMinutes <= 0 || waitTimeoutMinutes > 240) {
    return { ok: false, status: 400, error: 'wait timeout invalid' };
  }
  database
    .prepare('UPDATE rooms SET is_open = ?, wait_timeout_minutes = ? WHERE id = ?')
    .run(isOpen ? 1 : 0, waitTimeoutMinutes, room.id);
  return { ok: true, room: getRoom(room.id, database)! };
}

export function openRoomBySystem(roomId: string, database: Database.Database = getDb()): Room | null {
  return setRoomOpenBySystem(roomId, true, database);
}

export function closeRoomBySystem(roomId: string, database: Database.Database = getDb()): Room | null {
  return setRoomOpenBySystem(roomId, false, database);
}

export function setRoomSlug(
  roomId: string,
  slugInput: unknown,
  email: string,
  database: Database.Database = getDb(),
): { ok: true; room: Room } | { ok: false; status: 400 | 403 | 404 | 409; error: string } {
  const room = getRoom(roomId, database);
  if (!room) return { ok: false, status: 404, error: 'not found' };
  if (!isOwnerOf(room.id, email, database)) return { ok: false, status: 403, error: 'forbidden' };
  const validation = validateCustomSlug(slugInput);
  if (!validation.ok) return { ok: false, status: 400, error: validation.error };
  const conflict = database
    .prepare('SELECT id FROM rooms WHERE (slug = ? OR id = ?) AND id <> ?')
    .get(validation.slug, validation.slug, room.id) as { id: string } | undefined;
  if (conflict) return { ok: false, status: 409, error: 'slug taken' };
  database.prepare('UPDATE rooms SET slug = ? WHERE id = ?').run(validation.slug, room.id);
  return { ok: true, room: getRoom(room.id, database)! };
}

export function deleteRoom(id: string, database: Database.Database = getDb()): boolean {
  const tx = database.transaction((roomId: string) => {
    database.prepare('DELETE FROM meeting_sessions WHERE room_id = ?').run(roomId);
    return database.prepare('DELETE FROM rooms WHERE id = ?').run(roomId).changes;
  });
  return tx(id) > 0;
}

export function bulkDeleteOwnedRooms(
  ids: string[],
  email: string,
  database: Database.Database = getDb(),
): { deleted: number; requested: number } {
  const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.length > 0)));
  if (unique.length === 0) return { deleted: 0, requested: 0 };
  const placeholders = unique.map(() => '?').join(',');
  const tx = database.transaction(() => {
    database
      .prepare(`DELETE FROM meeting_sessions WHERE room_id IN (SELECT id FROM rooms WHERE owner_email = ? AND id IN (${placeholders}))`)
      .run(email, ...unique);
    return database
      .prepare(`DELETE FROM rooms WHERE owner_email = ? AND id IN (${placeholders})`)
      .run(email, ...unique).changes;
  });
  return { deleted: tx(), requested: unique.length };
}

function createAutoSlug(title: string): string {
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${slugBase(title)}-${suffix}`;
}

function slugBase(value: string): string {
  const base = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return (base || 'room').slice(0, 48).replace(/-+$/g, '') || 'room';
}

function normalizeRoomSearch(value: string): string {
  return String(value || '').trim().slice(0, 100);
}

function titleSearchFilter(search: string): { sql: string; params: string[] } {
  if (!search) return { sql: '', params: [] };
  return { sql: " AND title COLLATE NOCASE LIKE ? ESCAPE '\\'", params: [`%${escapeLike(search)}%`] };
}

function setRoomOpenBySystem(roomId: string, isOpen: boolean, database: Database.Database): Room | null {
  const room = getRoom(roomId, database);
  if (!room) return null;
  database.prepare('UPDATE rooms SET is_open = ? WHERE id = ?').run(isOpen ? 1 : 0, room.id);
  return getRoom(room.id, database);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function validateCustomSlug(input: unknown): SlugValidationResult {
  const slug = String(input || '').trim().toLowerCase();
  if (!slug) return { ok: false, error: 'slug invalid' };
  if (slug.length > MAX_SLUG_LENGTH) return { ok: false, error: 'slug too long' };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { ok: false, error: 'slug invalid' };
  if (RESERVED_SLUGS.has(slug) || /^[a-f0-9]{12}$/.test(slug)) return { ok: false, error: 'slug reserved' };
  return { ok: true, slug };
}
