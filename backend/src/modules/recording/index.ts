import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import express from 'express';
import { getDb, getRepoRoot } from '../../db.js';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { getRoom, isOwnerOf } from '../rooms/store.js';
import { getOpenSessionFor } from '../sessions/store.js';

export type RecordingEntry = {
  filename: string;
  sizeBytes: number;
  sessionId: string | null;
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

  router.post('/upload', requireAuth(database), express.raw({ type: '*/*', limit: '200mb' }), (req, res) => {
    const dir = ensureRecordingsDir();
    const authReq = req as AuthenticatedRequest;
    const ext = sanitizeExt(req.header('X-Ext'));
    const roomId = sanitizeRoomId(req.header('X-Room'));
    const room = getRoom(roomId, database);
    if (!room) return res.status(404).json({ error: 'room not found' });
    if (room.ownerEmail !== authReq.user.email) return res.status(403).json({ error: 'forbidden' });
    const session = getOpenSessionFor(room.id, authReq.user.email, database);
    if (!session) return res.status(409).json({ error: 'no open meeting session' });
    const roomSlug = sanitizeSlug(room.title);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rand = crypto.randomBytes(3).toString('hex');
    const filename = `${stamp}_${session.id}_${room.id}_${roomSlug}_${rand}.${ext}`;
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
    const sessionId = typeof req.query.session === 'string' ? req.query.session : null;
    if (hasPaginationQuery(req.query)) {
      const { page, pageSize } = parsePagination(req.query);
      const result = listRecordingsPageForUser(authReq.user.email, page, pageSize, database, sessionId);
      return res.json({ recordings: result.recordings, page, pageSize, total: result.total });
    }
    const recordings = listRecordingsForUser(authReq.user.email, database, sessionId);
    res.json({ recordings });
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

export function listRecordingsForUser(
  email: string,
  database: Database.Database = getDb(),
  sessionId: string | null = null,
): RecordingEntry[] {
  const dir = ensureRecordingsDir();
  return fs
    .readdirSync(dir)
    .filter((filename) => filename.endsWith('.webm') && isSafeFilename(filename))
    .map((filename) => {
      const parsed = parseRecordingFilename(filename);
      if (!parsed) return null;
      if (sessionId && parsed.sessionId !== sessionId) return null;
      const room = getRoom(parsed.roomId, database);
      if (!room || !isOwnerOf(room.id, email, database)) return null;
      const stat = fs.statSync(path.join(dir, filename));
      return {
        filename,
        sizeBytes: stat.size,
        sessionId: parsed.sessionId,
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

export function listRecordingsPageForUser(
  email: string,
  page: number,
  pageSize: number,
  database: Database.Database = getDb(),
  sessionId: string | null = null,
): { recordings: RecordingEntry[]; total: number } {
  const recordings = listRecordingsForUser(email, database, sessionId);
  const offset = (page - 1) * pageSize;
  return { recordings: recordings.slice(offset, offset + pageSize), total: recordings.length };
}

export function countRecordingsBySessionForUser(
  email: string,
  database: Database.Database = getDb(),
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const recording of listRecordingsForUser(email, database)) {
    if (!recording.sessionId) continue;
    counts.set(recording.sessionId, (counts.get(recording.sessionId) || 0) + 1);
  }
  return counts;
}

export function parseRecordingFilename(filename: string): { sessionId: string | null; roomId: string } | null {
  if (!isSafeFilename(filename)) return null;
  const withoutExt = filename.replace(/\.webm$/i, '');
  const newShape = withoutExt.match(
    /^\d{4}-.*_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([a-f0-9]{12})_.+_([a-f0-9]{6})$/i,
  );
  if (newShape) return { sessionId: newShape[1], roomId: newShape[2] };
  const oldShape = withoutExt.match(/^\d{4}-.*_([a-f0-9]{12})_.+_([a-f0-9]{6})$/i);
  if (oldShape) return { sessionId: null, roomId: oldShape[1] };
  return null;
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
