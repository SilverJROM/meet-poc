import fs from 'node:fs';
import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import {
  NON_ADMIN_QUOTA_BYTES,
  backgroundFilePath,
  createBackground,
  deleteBackground,
  getBackgroundRow,
  listBackgrounds,
  usedBytes,
} from './store.js';

const DATA_URL_RE = /^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/;

export function backgroundsRouter(database: Database.Database = getDb()): Router {
  const router = Router();
  const auth = requireAuth(database);

  // List backgrounds + quota usage for the signed-in user.
  router.get('/account/backgrounds', auth, (req, res) => {
    const { user } = req as AuthenticatedRequest;
    return res.json({
      backgrounds: listBackgrounds(user.email, database),
      used: usedBytes(user.email, database),
      quota: user.isAdmin ? null : NON_ADMIN_QUOTA_BYTES,
      isAdmin: user.isAdmin,
    });
  });

  // Upload a (client-resized) background as a data URL. Higher body limit than
  // the global 1mb so an image always fits; non-admins are quota-checked.
  router.post('/account/backgrounds', auth, (req, res) => {
    const { user } = req as AuthenticatedRequest;
    const label = String(req.body?.label ?? '');
    const dataUrl = String(req.body?.dataUrl ?? '');
    const m = DATA_URL_RE.exec(dataUrl);
    if (!m) return res.status(400).json({ error: 'invalid image data' });
    const mime = m[1];
    let bytes: Buffer;
    try {
      bytes = Buffer.from(m[2], 'base64');
    } catch {
      return res.status(400).json({ error: 'invalid image data' });
    }
    const result = createBackground(user.email, user.isAdmin, label, mime, bytes, database);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    console.log(`[backgrounds] "${user.email}" uploaded ${result.background.id} (${bytes.length}B)`);
    return res.json({ background: result.background, used: usedBytes(user.email, database) });
  });

  // Serve a background image (owner-scoped; cookie auth carries the session).
  router.get('/account/backgrounds/:id/image', auth, (req, res) => {
    const { user } = req as AuthenticatedRequest;
    const row = getBackgroundRow(String(req.params.id), database);
    if (!row || row.owner_email.toLowerCase() !== user.email.toLowerCase()) {
      return res.status(404).json({ error: 'not found' });
    }
    const filePath = backgroundFilePath(row.id, row.ext);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' });
    res.setHeader('Content-Type', row.mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.sendFile(filePath);
  });

  router.delete('/account/backgrounds/:id', auth, (req, res) => {
    const { user } = req as AuthenticatedRequest;
    const ok = deleteBackground(String(req.params.id), user.email, database);
    if (!ok) return res.status(404).json({ error: 'not found' });
    return res.json({ ok: true, used: usedBytes(user.email, database) });
  });

  return router;
}
