import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import express from 'express';
import { getDb, getRepoRoot } from '../../db.js';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { getRoom, isOwnerOf } from '../rooms/store.js';

export type RecordingEntry = {
  filename: string;
  sizeBytes: number;
  roomId: string;
  roomTitle: string;
  uploadedAtIso: string;
};

type UploadResponse = {
  ok: true;
  file: string;
  bytes: number;
};

export function getRecordingsDir(): string {
  return process.env.MEET_RECORDINGS_DIR || path.join(getRepoRoot(), 'recordings');
}

export function ensureRecordingsDir(): string {
  const dir = getRecordingsDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function recordingRouter(database: Database.Database = getDb()): express.Router {
  const router = express.Router();

  router.post('/upload', express.raw({ type: '*/*', limit: '200mb' }), (req, res) => {
    const dir = ensureRecordingsDir();
    const ext = sanitizeExt(req.header('X-Ext'));
    const roomId = sanitizeRoomId(req.header('X-Room'));
    const room = getRoom(roomId, database);
    const roomSlug = sanitizeSlug(room?.title || roomId || 'unknown');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rand = crypto.randomBytes(3).toString('hex');
    const filename = `${stamp}_${roomId || 'unknown'}_${roomSlug}_${rand}.${ext}`;
    const filepath = path.join(dir, filename);
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    fs.writeFile(filepath, body, (err) => {
      if (err) {
        console.error('[rec] write error', err);
        res.status(500).json({ ok: false, error: String(err) });
        return;
      }
      console.log(`[rec] saved ${filename} (${(body.length / 1024).toFixed(1)} KB)`);
      res.json({ ok: true, file: filename, bytes: body.length } satisfies UploadResponse);
    });
  });

  router.get('/api/recordings', requireAuth(database), (req, res) => {
    ensureRecordingsDir();
    const authReq = req as AuthenticatedRequest;
    res.json({ recordings: listRecordingsForUser(authReq.user.email, database) });
  });

  router.get('/api/recordings/:filename/download', requireAuth(database), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const filename = String(req.params.filename || '');
    if (!isSafeFilename(filename)) return res.status(404).json({ error: 'not found' });
    const parsed = parseRecordingFilename(filename);
    if (!parsed || !isOwnerOf(parsed.roomId, authReq.user.email, database)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const filepath = path.join(ensureRecordingsDir(), filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'not found' });
    res.setHeader('Content-Type', 'video/webm');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(filepath).pipe(res);
  });

  return router;
}

export function listRecordingsForUser(email: string, database: Database.Database = getDb()): RecordingEntry[] {
  const dir = ensureRecordingsDir();
  return fs
    .readdirSync(dir)
    .filter((filename) => filename.endsWith('.webm') && isSafeFilename(filename))
    .map((filename) => {
      const parsed = parseRecordingFilename(filename);
      if (!parsed) return null;
      const room = getRoom(parsed.roomId, database);
      if (!room || !isOwnerOf(room.id, email, database)) return null;
      const stat = fs.statSync(path.join(dir, filename));
      return {
        filename,
        sizeBytes: stat.size,
        roomId: room.id,
        roomTitle: room.title,
        uploadedAtIso: new Date(stat.mtimeMs).toISOString(),
        mtimeMs: stat.mtimeMs,
      };
    })
    .filter((entry): entry is RecordingEntry & { mtimeMs: number } => !!entry)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map(({ mtimeMs: _mtimeMs, ...entry }) => entry);
}

export function parseRecordingFilename(filename: string): { roomId: string } | null {
  if (!isSafeFilename(filename)) return null;
  const parts = filename.split('_');
  const roomId = parts[1] || '';
  if (!/^[a-f0-9]{12}$/.test(roomId)) return null;
  return { roomId };
}

function sanitizeExt(value: string | undefined): string {
  return String(value || 'webm').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase() || 'webm';
}

function sanitizeRoomId(value: string | undefined): string {
  return String(value || '').replace(/[^a-z0-9]/gi, '').slice(0, 32).toLowerCase();
}

function sanitizeSlug(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'room';
}

function isSafeFilename(filename: string): boolean {
  return path.basename(filename) === filename && /^[a-zA-Z0-9_.-]+$/.test(filename);
}
