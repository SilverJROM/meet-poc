import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { createRoom, deleteRoom, getRoom, isOwnerOf, listOwnedRooms, listOwnedRoomsPage } from './store.js';

function hasPaginationQuery(query: Record<string, unknown>): boolean {
  return query.page != null || query.pageSize != null;
}

function parsePagination(query: Record<string, unknown>): { page: number; pageSize: number } {
  const page = parsePositiveInt(query.page, 1);
  const pageSize = Math.min(parsePositiveInt(query.pageSize, 20), 100);
  return { page, pageSize };
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
    if (hasPaginationQuery(req.query)) {
      const { page, pageSize } = parsePagination(req.query);
      const result = listOwnedRoomsPage(authed.user.email, page, pageSize, database);
      return res.json({ rooms: result.rooms, page, pageSize, total: result.total });
    }
    return res.json({ rooms: listOwnedRooms(authed.user.email, database) });
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

  router.get('/rooms/:id/exists', (req, res) => {
    const room = getRoom(String(req.params.id), database);
    if (!room) return res.json({ exists: false });
    return res.json({ exists: true, title: room.title });
  });

  return router;
}
