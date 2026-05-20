import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import express from 'express';
import { getDb, getRepoRoot } from '../../db.js';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { runAutoAnalysesForRecording } from '../questions/index.js';
import { getRoom, isOwnerOf } from '../rooms/store.js';
import { getOpenSessionFor } from '../sessions/store.js';

export type RecordingEntry = {
  filename: string;
  sizeBytes: number;
  sessionId: string | null;
  roomId: string;
  roomTitle: string;
  uploadedAtIso: string;
  hasMetadata: boolean;
  speakerCount: number | null;
  durationMs: number | null;
  hasTranscript: boolean;
  transcribeStatus: TranscribeStatus;
};

type UploadResponse = {
  ok: true;
  file: string;
  bytes: number;
};

type TranscribeStatus = 'ready' | 'pending' | 'failed' | null;

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
      scheduleTranscription(filename, database);
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

  router.post('/api/recordings/upload-metadata', requireAuth(database), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const filename = typeof req.body?.filename === 'string' ? req.body.filename : '';
    const metadata = req.body?.metadata;
    if (isUnsafeRecordingFilename(filename) || !isRecordingFilename(filename)) {
      return res.status(400).json({ error: 'invalid filename' });
    }
    if (!isMetadataObject(metadata) || metadata.schemaVersion !== 1) {
      return res.status(400).json({ error: 'invalid metadata' });
    }
    const parsed = parseRecordingFilename(filename);
    if (!parsed) return res.status(400).json({ error: 'invalid filename' });
    const room = getRoom(parsed.roomId, database);
    if (!room) return res.status(404).json({ error: 'recording not found' });
    if (room.ownerEmail !== authReq.user.email) return res.status(403).json({ error: 'forbidden' });
    const filepath = safeRecordingPath(filename);
    if (!filepath || !fs.existsSync(filepath)) return res.status(404).json({ error: 'recording not found' });
    const metaPath = metadataPathFor(filename);
    if (!metaPath) return res.status(400).json({ error: 'invalid filename' });
    const body = JSON.stringify(metadata, null, 2);
    fs.writeFileSync(metaPath, body);
    return res.json({ ok: true, metaFile: `${filename}.meta.json`, bytes: Buffer.byteLength(body) });
  });

  router.get('/api/recordings/:filename/transcript', requireAuth(database), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const filename = String(req.params.filename || '');
    const ownership = ownedRecordingPath(filename, authReq.user.email, database);
    if (ownership.status !== 200) return res.status(ownership.status).json({ error: ownership.error });
    const transcriptPath = transcriptPathFor(filename);
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return res.status(404).json({ error: 'transcript not found' });
    try {
      return res.json(JSON.parse(fs.readFileSync(transcriptPath, 'utf8')));
    } catch {
      return res.status(500).json({ error: 'transcript unreadable' });
    }
  });

  router.get('/api/recordings/:filename/transcript.txt', requireAuth(database), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const filename = String(req.params.filename || '');
    const ownership = ownedRecordingPath(filename, authReq.user.email, database);
    if (ownership.status !== 200) return res.status(ownership.status).json({ error: ownership.error });
    const transcriptPath = transcriptPathFor(filename);
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return res.status(404).json({ error: 'transcript not found' });
    try {
      const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf8')) as { lines?: unknown };
      const body = formatTranscriptText(transcript);
      const basename = path.basename(filename, path.extname(filename));
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${basename}.txt"`);
      return res.send(body);
    } catch {
      return res.status(500).json({ error: 'transcript unreadable' });
    }
  });

  router.delete('/api/recordings/:filename/transcript', requireAuth(database), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const filename = String(req.params.filename || '');
    const ownership = ownedRecordingPath(filename, authReq.user.email, database);
    if (ownership.status !== 200) return res.status(ownership.status).json({ error: ownership.error });
    const transcriptPath = transcriptPathFor(filename);
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return res.status(404).json({ error: 'transcript not found' });
    fs.unlinkSync(transcriptPath);
    const lockPath = transcriptLockPathFor(filename);
    if (lockPath) {
      try {
        fs.unlinkSync(lockPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    }
    return res.status(204).send();
  });

  router.post('/api/recordings/:filename/transcribe', requireAuth(database), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const filename = String(req.params.filename || '');
    const ownership = ownedRecordingPath(filename, authReq.user.email, database);
    if (ownership.status !== 200) return res.status(ownership.status).json({ error: ownership.error });
    spawnTranscription(filename, { force: req.body?.force === true }, database);
    return res.json({ ok: true, status: 'started' });
  });

  router.post('/api/recordings/bulk-delete', requireAuth(database), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const raw = req.body && Array.isArray(req.body.filenames) ? req.body.filenames : null;
    if (!raw) return res.status(400).json({ error: 'filenames array required' });
    const filenames = raw.map((value: unknown) => String(value)).slice(0, 200);
    let deleted = 0;
    for (const filename of filenames) {
      if (deleteOwnedRecording(filename, authReq.user.email, database)) deleted += 1;
    }
    return res.json({ ok: true, deleted, requested: filenames.length });
  });

  router.delete('/api/recordings/:filename', requireAuth(database), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const filename = String(req.params.filename || '');
    const parsed = parseRecordingFilename(filename);
    if (!parsed || isUnsafeRecordingFilename(filename)) return res.status(404).json({ error: 'not found' });
    const room = getRoom(parsed.roomId, database);
    if (!room) return res.status(404).json({ error: 'not found' });
    if (room.ownerEmail !== authReq.user.email) return res.status(403).json({ error: 'forbidden' });
    const filepath = safeRecordingPath(filename);
    if (!filepath || !fs.existsSync(filepath)) return res.status(404).json({ error: 'not found' });
    fs.unlinkSync(filepath);
    deleteRecordingSidecars(filename);
    return res.json({ ok: true });
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
    res.setHeader('Content-Type', contentTypeFor(filename));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(filepath).pipe(res);
  });

  return router;
}

function deleteOwnedRecording(filename: string, email: string, database: Database.Database): boolean {
  if (isUnsafeRecordingFilename(filename)) return false;
  const parsed = parseRecordingFilename(filename);
  if (!parsed) return false;
  const room = getRoom(parsed.roomId, database);
  if (!room || room.ownerEmail !== email) return false;
  const filepath = safeRecordingPath(filename);
  if (!filepath) return false;
  try {
    fs.unlinkSync(filepath);
    deleteRecordingSidecars(filename);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

function metadataPathFor(filename: string): string | null {
  const filepath = safeRecordingPath(filename);
  if (!filepath) return null;
  return `${filepath}.meta.json`;
}

function transcriptPathFor(filename: string): string | null {
  const filepath = safeRecordingPath(filename);
  if (!filepath) return null;
  return `${filepath}.transcript.json`;
}

function transcriptLockPathFor(filename: string): string | null {
  const filepath = safeRecordingPath(filename);
  if (!filepath) return null;
  return `${filepath}.transcribe.lock`;
}

function deleteRecordingSidecars(filename: string): void {
  for (const sidecarPath of [metadataPathFor(filename), transcriptPathFor(filename), transcriptLockPathFor(filename)]) {
    if (!sidecarPath) continue;
    try {
      fs.unlinkSync(sidecarPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  deleteAnalysisSidecars(filename);
}

function deleteAnalysisSidecars(filename: string): void {
  const dir = ensureRecordingsDir();
  const prefix = `${filename}.analysis.`;
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.startsWith(prefix) || !entry.endsWith('.json')) continue;
    try {
      fs.unlinkSync(path.join(dir, entry));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}

function formatTranscriptText(transcript: { lines?: unknown }): string {
  const lines = Array.isArray(transcript.lines) ? transcript.lines : [];
  return lines.map((line) => formatTranscriptLine(line)).join('\n') + (lines.length ? '\n' : '');
}

function formatTranscriptLine(value: unknown): string {
  const line = value as { startMs?: unknown; name?: unknown; text?: unknown };
  const startMs = typeof line.startMs === 'number' && Number.isFinite(line.startMs) ? line.startMs : 0;
  const speaker = typeof line.name === 'string' && line.name.trim() && line.name.trim() !== '?' ? line.name.trim() : 'Speaker';
  const text = typeof line.text === 'string' ? line.text.trim() : '';
  return `[${formatTranscriptTimestamp(startMs)}] ${speaker}: ${text}`;
}

function formatTranscriptTimestamp(startMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(startMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function isMetadataObject(value: unknown): value is { schemaVersion?: unknown; participants?: unknown } {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function metadataSummary(filename: string): { hasMetadata: boolean; speakerCount: number | null; durationMs: number | null } {
  const metaPath = metadataPathFor(filename);
  if (!metaPath || !fs.existsSync(metaPath)) return { hasMetadata: false, speakerCount: null, durationMs: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { participants?: unknown; recordingDurationMs?: unknown };
    return {
      hasMetadata: true,
      speakerCount: Array.isArray(parsed.participants) ? parsed.participants.length : null,
      durationMs: typeof parsed.recordingDurationMs === 'number' ? parsed.recordingDurationMs : null,
    };
  } catch {
    return { hasMetadata: true, speakerCount: null, durationMs: null };
  }
}

function transcriptSummary(filename: string, recordingMtimeMs: number): { hasTranscript: boolean; transcribeStatus: TranscribeStatus } {
  const transcriptPath = transcriptPathFor(filename);
  if (transcriptPath && fs.existsSync(transcriptPath)) {
    try {
      JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
      return { hasTranscript: true, transcribeStatus: 'ready' };
    } catch {
      return { hasTranscript: false, transcribeStatus: 'failed' };
    }
  }
  const lockPath = transcriptLockPathFor(filename);
  if (lockPath && fs.existsSync(lockPath)) return { hasTranscript: false, transcribeStatus: 'pending' };
  const ageMs = Date.now() - recordingMtimeMs;
  return { hasTranscript: false, transcribeStatus: ageMs > 30 * 60 * 1000 ? 'failed' : 'pending' };
}

function ownedRecordingPath(
  filename: string,
  email: string,
  database: Database.Database,
): { status: 200; filepath: string } | { status: 400 | 403 | 404; error: string } {
  const parsed = parseRecordingFilename(filename);
  if (!parsed || isUnsafeRecordingFilename(filename)) return { status: 404, error: 'not found' };
  const room = getRoom(parsed.roomId, database);
  if (!room) return { status: 404, error: 'not found' };
  if (room.ownerEmail !== email) return { status: 403, error: 'forbidden' };
  const filepath = safeRecordingPath(filename);
  if (!filepath || !fs.existsSync(filepath)) return { status: 404, error: 'not found' };
  return { status: 200, filepath };
}

function spawnTranscription(filename: string, options: { force: boolean }, database: Database.Database = getDb()): void {
  if (process.env.MEET_TRANSCRIBE_DISABLED === '1') return;
  const filepath = safeRecordingPath(filename);
  const lockPath = transcriptLockPathFor(filename);
  if (!filepath || !lockPath) return;
  const transcriptPath = transcriptPathFor(filename);
  if (!options.force && transcriptPath && fs.existsSync(transcriptPath)) return;
  try {
    fs.writeFileSync(lockPath, JSON.stringify({ startedAtIso: new Date().toISOString(), filename }, null, 2));
  } catch (err) {
    console.error('[transcribe] lock create failed', err);
    return;
  }
  const python = process.env.MEET_TRANSCRIBE_PYTHON || path.join(getRepoRoot(), 'backend', '.venv-transcribe', 'bin', 'python');
  const script = process.env.MEET_TRANSCRIBE_SCRIPT || path.join(getRepoRoot(), 'backend', 'scripts', 'transcribe.py');
  const args = [script, filepath, ...(options.force ? ['--force'] : [])];
  console.log(`[transcribe] start ${filename}`);
  const child = spawn(python, args, {
    cwd: getRepoRoot(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => console.log(`[transcribe] ${String(chunk).trim()}`));
  child.stderr.on('data', (chunk) => console.error(`[transcribe] ${String(chunk).trim()}`));
  child.on('error', (err) => {
    console.error(`[transcribe] failed to start ${filename}`, err);
    cleanupTranscribeLock(lockPath);
  });
  child.on('close', (code) => {
    cleanupTranscribeLock(lockPath);
    if (code === 0) {
      console.log(`[transcribe] finished ${filename}`);
      if (process.env.NODE_ENV !== 'test' || process.env.MEET_LLM_ANALYZE_FAKE === '1') {
        void runAutoAnalysesForRecording(filename, database).catch((err) => console.error(`[analysis] auto queue failed ${filename}`, err));
      }
    } else {
      console.error(`[transcribe] exited ${code} for ${filename}`);
    }
  });
}

function scheduleTranscription(filename: string, database: Database.Database): void {
  const delayMs = Number(process.env.MEET_TRANSCRIBE_UPLOAD_DELAY_MS || 1500);
  windowlessSetTimeout(() => spawnTranscription(filename, { force: false }, database), Number.isFinite(delayMs) ? Math.max(0, delayMs) : 1500);
}

function windowlessSetTimeout(callback: () => void, delayMs: number): void {
  setTimeout(callback, delayMs).unref?.();
}

function cleanupTranscribeLock(lockPath: string): void {
  try {
    fs.unlinkSync(lockPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[transcribe] lock cleanup failed', err);
  }
}

function safeRecordingPath(filename: string): string | null {
  if (isUnsafeRecordingFilename(filename)) return null;
  const dir = path.resolve(ensureRecordingsDir());
  const filepath = path.resolve(path.join(dir, filename));
  const prefix = dir.endsWith(path.sep) ? dir : `${dir}${path.sep}`;
  if (filepath !== dir && !filepath.startsWith(prefix)) return null;
  return filepath;
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
    .filter((filename) => isRecordingFilename(filename) && isSafeFilename(filename))
    .map((filename) => {
      const parsed = parseRecordingFilename(filename);
      if (!parsed) return null;
      if (sessionId && parsed.sessionId !== sessionId) return null;
      const room = getRoom(parsed.roomId, database);
      if (!room || !isOwnerOf(room.id, email, database)) return null;
      const stat = fs.statSync(path.join(dir, filename));
      const meta = metadataSummary(filename);
      const transcript = transcriptSummary(filename, stat.mtimeMs);
      return {
        filename,
        sizeBytes: stat.size,
        sessionId: parsed.sessionId,
        roomId: room.id,
        roomTitle: room.title,
        uploadedAtIso: new Date(stat.mtimeMs).toISOString(),
        hasMetadata: meta.hasMetadata,
        speakerCount: meta.speakerCount,
        durationMs: meta.durationMs,
        hasTranscript: transcript.hasTranscript,
        transcribeStatus: transcript.transcribeStatus,
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
  const withoutExt = filename.replace(/\.[a-z0-9]+$/i, '');
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

function isRecordingFilename(filename: string): boolean {
  return /\.(webm|mp4|aac)$/i.test(filename);
}

function contentTypeFor(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.mp4') return 'audio/mp4';
  if (ext === '.aac') return 'audio/aac';
  return 'audio/webm';
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

function isUnsafeRecordingFilename(filename: string): boolean {
  return !filename || filename.includes('..') || /[\\/]/.test(filename) || !isSafeFilename(filename);
}
