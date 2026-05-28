import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import {
  bulkDeleteOwnedRooms,
  createRoom,
  deleteRoom,
  getRoom,
  getRoomBySlugOrId,
  isOwnerOf,
  listOwnedRooms,
  listOwnedRoomsPage,
  setRoomAccess,
  setRoomSlug,
} from './store.js';
import { notifyRoomAccessChanged } from '../signaling/index.js';

function hasPaginationQuery(query: Record<string, unknown>): boolean {
  return query.page != null || query.pageSize != null;
}

function parsePagination(query: Record<string, unknown>): { page: number; pageSize: number } {
  const page = parsePositiveInt(query.page, 1);
  const pageSize = Math.min(parsePositiveInt(query.pageSize, 20), 100);
  return { page, pageSize };
}

function parseSearchQuery(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || '').trim().slice(0, 100);
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

export function roomsRouter(database: Database.Database = getDb()): Router {
  const router = Router();
  const auth = requireAuth(database);

  router.post('/rooms', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const room = createRoom(req.body?.title, authed.user.email, database);
    return res.json({ room });
  });

  router.get('/rooms', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const q = parseSearchQuery(req.query.q);
    if (hasPaginationQuery(req.query)) {
      const { page, pageSize } = parsePagination(req.query);
      const result = listOwnedRoomsPage(authed.user.email, page, pageSize, database, q);
      return res.json({ rooms: result.rooms, page, pageSize, total: result.total });
    }
    return res.json({ rooms: listOwnedRooms(authed.user.email, database, q) });
  });

  router.delete('/rooms/:id', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const id = String(req.params.id);
    const room = getRoom(id, database);
    if (!room) return res.status(404).json({ error: 'not found' });
    if (!isOwnerOf(room.id, authed.user.email, database)) return res.status(403).json({ error: 'forbidden' });
    deleteRoom(room.id, database);
    return res.json({ ok: true });
  });

  router.put('/rooms/:id/slug', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const result = setRoomSlug(String(req.params.id), req.body?.slug, authed.user.email, database);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({ room: result.room });
  });

  router.put('/rooms/:id/access', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const result = setRoomAccess(
      String(req.params.id),
      { isOpen: req.body?.isOpen, waitTimeoutMinutes: req.body?.waitTimeoutMinutes },
      authed.user.email,
      database,
    );
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    notifyRoomAccessChanged(result.room.id, result.room.isOpen, result.room.waitTimeoutMinutes, database);
    return res.json({ room: result.room });
  });

  router.post('/rooms/bulk-delete', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const raw = (req.body && Array.isArray(req.body.ids)) ? req.body.ids : null;
    if (!raw) return res.status(400).json({ error: 'ids array required' });
    const ids = raw.map((v: unknown) => String(v)).slice(0, 200);
    const result = bulkDeleteOwnedRooms(ids, authed.user.email, database);
    return res.json({ ok: true, ...result });
  });

  router.get('/rooms/by-slug/:slug', (req, res) => {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return res.status(404).json({ error: 'not found' });
    const room = getRoomBySlugOrId(slug, database);
    if (!room) return res.status(404).json({ error: 'not found' });
    return res.json({ room: { id: room.id, slug: room.slug, title: room.title, isOpen: room.isOpen } });
  });

  router.get('/rooms/:id/exists', (req, res) => {
    const room = getRoomBySlugOrId(String(req.params.id), database);
    if (!room) return res.json({ exists: false });
    return res.json({ exists: true, id: room.id, title: room.title, slug: room.slug, isOpen: room.isOpen, waitTimeoutMinutes: room.waitTimeoutMinutes });
  });

  return router;
}
