import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { createRoom, deleteRoom, getRoom, isOwnerOf, listOwnedRooms } from './store.js';

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
