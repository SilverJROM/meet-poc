import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import express from 'express';
import { getDb, getRepoRoot } from '../../db.js';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { runAutoAnalysesForRecording } from '../questions/index.js';
import {
  DEFAULT_TRANSCRIBER_MODEL,
  getCloudTranscriberModel,
  getTranscriberModel,
  getTranscriptionMode,
  getTranscriptionProvider,
  type TranscriptionProvider,
} from '../questions/store.js';
import { transcribeViaOpenRouter } from './openrouter-transcribe.js';
import {
  deleteAllTranscriptSidecars,
  deleteTranscriptVersion,
  listTranscriptVersions,
  resolvePrimaryTranscriptPath,
  setPrimaryTranscript,
  transcriptVersionPathFor,
} from './transcript-versions.js';
import { getRoom, isOwnerOf } from '../rooms/store.js';
import { getRecentSessionFor } from '../sessions/store.js';

const RECORDING_UPLOAD_SESSION_GRACE_MS = 5 * 60 * 1000;

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

type TranscribeJobOptions = {
  force: boolean;
  provider?: TranscriptionProvider;
  model?: string;
};

function warnRecordingUploadRejected(reason: string, roomId: string, email: string, detail?: string): void {
  const suffix = detail ? ` detail=${detail}` : '';
  console.warn(`[rec] rejected ${reason} room=${roomId || '<missing>'} user=${email}${suffix}`);
}

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
    if (!room) {
      warnRecordingUploadRejected('room-not-found', roomId, authReq.user.email);
      return res.status(404).json({ error: 'room not found' });
    }
    if (room.ownerEmail !== authReq.user.email) {
      warnRecordingUploadRejected('owner-mismatch', room.id, authReq.user.email, `owner=${room.ownerEmail}`);
      return res.status(403).json({ error: 'forbidden' });
    }
    const session = getRecentSessionFor(room.id, authReq.user.email, RECORDING_UPLOAD_SESSION_GRACE_MS, database);
    if (!session) {
      warnRecordingUploadRejected('no-open-or-recent-session', room.id, authReq.user.email);
      return res.status(409).json({ error: 'no open meeting session' });
    }
    const roomSlug = sanitizeSlug(room.title);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rand = crypto.randomBytes(3).toString('hex');
    const isPerUser = req.header('X-PerUser') === '1';
    const rawDisplayName = req.header('X-DisplayName') || '';
    const rawClientId = req.header('X-ClientId') || '';
    const filename = isPerUser
      ? `${stamp}_${session.id}_${room.id}_${roomSlug}_${sanitizeDisplayNameSlug(rawDisplayName)}_${rand}.${ext}`
      : `${stamp}_${session.id}_${room.id}_${roomSlug}_${rand}.${ext}`;
    const filepath = path.join(dir, filename);
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    fs.writeFile(filepath, body, (err) => {
      if (err) {
        warnRecordingUploadRejected('write-error', room.id, authReq.user.email, String(err));
        res.status(500).json({ ok: false, error: String(err) });
        return;
      }
      if (isPerUser) {
        const displayName = rawDisplayName.replace(/[^\w\s\-]/g, '').trim().slice(0, 64) || 'participant';
        const clientId = rawClientId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
        // Persist this participant's join offset (ms since recording start) so the combined
        // transcript can shift their file-relative timestamps onto the shared call timeline —
        // critical for mid-call joiners. See readParticipantJoinOffsetMs.
        const rawJoined = Number(req.header('X-JoinedAtMs'));
        const joinedAtMs = Number.isFinite(rawJoined) && rawJoined >= 0 ? Math.round(rawJoined) : 0;
        const participantPath = participantPathFor(filename);
        if (participantPath) {
          try { fs.writeFileSync(participantPath, JSON.stringify({ displayName, clientId, joinedAtMs, isPerUser: true })); } catch {}
        }
      }
      console.log(`[rec] saved ${filename} (${(body.length / 1024).toFixed(1)} KB)${isPerUser ? ' [per-user]' : ''}`);
      res.json({ ok: true, file: filename, bytes: body.length } satisfies UploadResponse);
      // NOTE: transcription is deliberately NOT triggered here. Running whisper on
      // per-recording upload spikes CPU on the signaling box while the call is still
      // live. Transcription is post-call processing only: auto on session close
      // (maybeAutoTranscribeSession) or on demand (host-triggered endpoints).
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

  router.get('/api/recordings/named-transcript/:sessionId', requireAuth(database), (req, res) => {
    const built = buildNamedTranscript(String(req.params.sessionId || ''), (req as AuthenticatedRequest).user.email, database);
    if (!built.ok) return res.status(built.status).json({ error: built.error });
    return res.json(built.result);
  });

  router.get('/api/recordings/named-transcript/:sessionId/download', requireAuth(database), (req, res) => {
    const sessionId = String(req.params.sessionId || '');
    const built = buildNamedTranscript(sessionId, (req as AuthenticatedRequest).user.email, database);
    if (!built.ok) return res.status(built.status).json({ error: built.error });
    const body = formatNamedTranscriptText(built.result);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="meeting-transcript-${sessionId}.txt"`);
    return res.send(body);
  });

  // Deletes the TRANSCRIPT (all provider/model versions) for every per-user recording in a
  // session — the recordings' audio + metadata are left untouched, only the transcribed text.
  router.delete('/api/recordings/named-transcript/:sessionId', requireAuth(database), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const sessionId = String(req.params.sessionId || '');
    if (!sessionId || !/^[0-9a-f-]{8,}$/i.test(sessionId)) return res.status(400).json({ error: 'invalid sessionId' });
    const { perUserFiles } = listSessionRecordingFiles(sessionId, authReq.user.email, database);
    if (perUserFiles.length === 0) return res.status(404).json({ error: 'no per-user recordings for session' });
    let deleted = 0;
    for (const { filename } of perUserFiles) {
      const primaryPath = resolvePrimaryTranscriptPath(filename);
      if (primaryPath && fs.existsSync(primaryPath)) deleted += 1;
      deleteAllTranscriptSidecars(filename);
      const lockPath = transcriptLockPathFor(filename);
      if (lockPath) {
        try {
          fs.unlinkSync(lockPath);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
      }
    }
    return res.json({ ok: true, deleted });
  });

  router.get('/api/recordings/:filename/transcript/versions', requireAuth(database), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const filename = String(req.params.filename || '');
    const ownership = ownedRecordingPath(filename, authReq.user.email, database);
    if (ownership.status !== 200) return res.status(ownership.status).json({ error: ownership.error });
    return res.json({ filename, versions: listTranscriptVersions(filename) });
  });

  router.get('/api/recordings/:filename/transcript', requireAuth(database), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const filename = String(req.params.filename || '');
    const ownership = ownedRecordingPath(filename, authReq.user.email, database);
    if (ownership.status !== 200) return res.status(ownership.status).json({ error: ownership.error });
    const transcriptPath = resolvePrimaryTranscriptPath(filename);
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
    const transcriptPath = resolvePrimaryTranscriptPath(filename);
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

  router.delete('/api/recordings/:filename/transcript/versions', requireAuth(database), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const filename = String(req.params.filename || '');
    const ownership = ownedRecordingPath(filename, authReq.user.email, database);
    if (ownership.status !== 200) return res.status(ownership.status).json({ error: ownership.error });
    const provider = req.query.provider;
    const model = req.query.model;
    if (provider !== 'local' && provider !== 'openrouter') {
      return res.status(400).json({ error: 'provider must be local or openrouter' });
    }
    if (typeof model !== 'string' || !model.trim()) return res.status(400).json({ error: 'model required' });
    if (!deleteTranscriptVersion(filename, provider, model.trim())) {
      return res.status(404).json({ error: 'transcript version not found' });
    }
    return res.status(204).send();
  });

  router.put('/api/recordings/:filename/transcript/primary', requireAuth(database), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const filename = String(req.params.filename || '');
    const ownership = ownedRecordingPath(filename, authReq.user.email, database);
    if (ownership.status !== 200) return res.status(ownership.status).json({ error: ownership.error });
    const provider = req.body?.provider;
    const model = req.body?.model;
    if (provider !== 'local' && provider !== 'openrouter') {
      return res.status(400).json({ error: 'provider must be local or openrouter' });
    }
    if (typeof model !== 'string' || !model.trim()) return res.status(400).json({ error: 'model required' });
    try {
      setPrimaryTranscript(filename, provider, model.trim());
      return res.json({ ok: true, provider, model: model.trim() });
    } catch (err) {
      const message = (err as Error).message;
      if (message === 'transcript version not found') return res.status(404).json({ error: message });
      return res.status(400).json({ error: message });
    }
  });

  router.delete('/api/recordings/:filename/transcript', requireAuth(database), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const filename = String(req.params.filename || '');
    const ownership = ownedRecordingPath(filename, authReq.user.email, database);
    if (ownership.status !== 200) return res.status(ownership.status).json({ error: ownership.error });
    const transcriptPath = resolvePrimaryTranscriptPath(filename);
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
    if (!isPerUserRecording(filename)) return res.status(400).json({ error: 'mixed recordings are not transcribed' });
    const provider = parseTranscribeProvider(req.body?.provider);
    const model = typeof req.body?.model === 'string' ? req.body.model.trim() : undefined;
    enqueueTranscription(filename, { force: req.body?.force === true, provider, model }, database);
    return res.json({ ok: true, status: 'started' });
  });

  // On-demand: transcribe every recording in a session (host-triggered).
  router.post('/api/recordings/session/:sessionId/transcribe', requireAuth(database), (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const sessionId = String(req.params.sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
    const provider = parseTranscribeProvider(req.body?.provider);
    const model = typeof req.body?.model === 'string' ? req.body.model.trim() : undefined;
    const queued = transcribeSessionRecordings(sessionId, authReq.user.email, database, {
      force: req.body?.force === true,
      provider,
      model,
    });
    return res.json({ ok: true, status: 'started', queued });
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

// A per-user recording begins when that participant's stream first arrives — for a mid-call
// joiner that is their JOIN moment, not the recording start. Whisper therefore timestamps each
// per-user file from 0 (= that speaker's join), so to place a speaker's lines on the shared call
// timeline we must add their joinedAtMs (ms since recording start). Without this, a mid-joiner's
// lines land at ~0 and collide with the host's opening. Prefer the value persisted into the
// per-user sidecar; fall back to this file's .meta.json (participants[].joinedAtMs by clientId)
// for recordings written before the sidecar carried it; default 0 (no offset, no regression).
function readParticipantJoinOffsetMs(filename: string, sidecar: { clientId?: string; joinedAtMs?: number }): number {
  if (typeof sidecar.joinedAtMs === 'number' && Number.isFinite(sidecar.joinedAtMs) && sidecar.joinedAtMs >= 0) {
    return Math.round(sidecar.joinedAtMs);
  }
  if (!sidecar.clientId) return 0;
  const metaPath = metadataPathFor(filename);
  if (!metaPath || !fs.existsSync(metaPath)) return 0;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
      participants?: Array<{ clientId?: string; joinedAtMs?: number }>;
    };
    const participant = (meta.participants || []).find((p) => p.clientId === sidecar.clientId);
    if (participant && typeof participant.joinedAtMs === 'number' && Number.isFinite(participant.joinedAtMs) && participant.joinedAtMs >= 0) {
      return Math.round(participant.joinedAtMs);
    }
  } catch { /* unreadable meta — fall through to no offset */ }
  return 0;
}

export type NamedTranscriptLine = {
  startMs: number;
  endMs?: number;
  name: string;
  text: string;
  kind: 'speech' | 'event';
};

export type NamedTranscriptResult = {
  sessionId: string;
  speakers: string[];
  transcript: NamedTranscriptLine[];
};

type BuildNamedTranscriptResult =
  | { ok: true; result: NamedTranscriptResult }
  | { ok: false; status: number; error: string };

// Lists every recording file belonging to a session that the given owner can access, split into
// per-user speech files (with displayName + join offset) and the mixed (non-per-user) file, if
// any. Shared by buildNamedTranscript (read) and the session-transcript delete route (write).
function listSessionRecordingFiles(
  sessionId: string,
  ownerEmail: string,
  database: Database.Database,
): { perUserFiles: Array<{ filename: string; displayName: string; joinOffsetMs: number }>; mixedFilename: string | null } {
  const dir = ensureRecordingsDir();
  const perUserFiles: Array<{ filename: string; displayName: string; joinOffsetMs: number }> = [];
  let mixedFilename: string | null = null;
  for (const f of fs.readdirSync(dir).filter((f) => isRecordingFilename(f) && isSafeFilename(f))) {
    const parsed = parseRecordingFilename(f);
    if (!parsed || parsed.sessionId !== sessionId) continue;
    const room = getRoom(parsed.roomId, database);
    if (!room || !isOwnerOf(room.id, ownerEmail, database)) continue;
    const pPath = participantPathFor(f);
    if (pPath && fs.existsSync(pPath)) {
      try {
        const p = JSON.parse(fs.readFileSync(pPath, 'utf8')) as { displayName?: string; isPerUser?: boolean; clientId?: string; joinedAtMs?: number };
        if (p.isPerUser) perUserFiles.push({ filename: f, displayName: p.displayName || 'Participant', joinOffsetMs: readParticipantJoinOffsetMs(f, p) });
      } catch { /* skip unreadable sidecar */ }
    } else if (!mixedFilename) {
      mixedFilename = f;
    }
  }
  return { perUserFiles, mixedFilename };
}

// Builds the merged, call-timeline-synced transcript for a session: per-speaker speech lines
// (each offset by that speaker's real join time — see readParticipantJoinOffsetMs) interleaved
// with join/leave events read from the session's mixed-recording .meta.json (the only file that
// carries the full participants[] roster with joinedAtMs/leftAtMs for everyone, not just the
// per-user recorder's own owner).
function buildNamedTranscript(sessionId: string, ownerEmail: string, database: Database.Database): BuildNamedTranscriptResult {
  if (!sessionId || !/^[0-9a-f-]{8,}$/i.test(sessionId)) return { ok: false, status: 400, error: 'invalid sessionId' };
  const { perUserFiles, mixedFilename } = listSessionRecordingFiles(sessionId, ownerEmail, database);
  if (perUserFiles.length === 0) return { ok: false, status: 404, error: 'no per-user recordings for session' };

  // Events are collected separately and placed BEFORE speech lines in the merge input so that,
  // at a tied startMs (e.g. everyone shows "joined" at the same moment speech begins), a stable
  // sort keeps "X joined" ahead of X's first words — matching the real chronology (join, then
  // speak), not an arbitrary code-path ordering.
  const eventLines: NamedTranscriptLine[] = [];
  let hasEvents = false;
  if (mixedFilename) {
    const metaPath = metadataPathFor(mixedFilename);
    if (metaPath && fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
          participants?: Array<{ displayName?: string; joinedAtMs?: number; leftAtMs?: number | null }>;
        };
        for (const participant of meta.participants || []) {
          const name = typeof participant.displayName === 'string' && participant.displayName.trim() ? participant.displayName.trim() : 'Participant';
          if (typeof participant.joinedAtMs === 'number' && Number.isFinite(participant.joinedAtMs)) {
            eventLines.push({ startMs: participant.joinedAtMs, name, text: `${name} joined`, kind: 'event' });
            hasEvents = true;
          }
          if (typeof participant.leftAtMs === 'number' && Number.isFinite(participant.leftAtMs)) {
            eventLines.push({ startMs: participant.leftAtMs, name, text: `${name} left`, kind: 'event' });
            hasEvents = true;
          }
        }
      } catch { /* unreadable meta — proceed without events */ }
    }
  }

  const speechLines: NamedTranscriptLine[] = [];
  let hasSpeech = false;
  for (const { filename, displayName, joinOffsetMs } of perUserFiles) {
    const tPath = resolvePrimaryTranscriptPath(filename);
    if (!tPath || !fs.existsSync(tPath)) continue;
    try {
      const t = JSON.parse(fs.readFileSync(tPath, 'utf8')) as { lines?: unknown[] };
      if (!Array.isArray(t.lines)) continue;
      hasSpeech = true;
      for (const line of t.lines) {
        const l = line as { startMs?: number; endMs?: number; text?: string };
        // Shift this speaker's file-relative timestamps onto the shared call timeline.
        const baseStart = typeof l.startMs === 'number' ? l.startMs : 0;
        speechLines.push({
          startMs: baseStart + joinOffsetMs,
          endMs: typeof l.endMs === 'number' ? l.endMs + joinOffsetMs : undefined,
          name: displayName,
          text: typeof l.text === 'string' ? l.text : '',
          kind: 'speech',
        });
      }
    } catch { /* skip unreadable transcript */ }
  }

  if (!hasSpeech && !hasEvents) return { ok: false, status: 404, error: 'no transcripts ready yet' };
  const allLines = [...eventLines, ...speechLines].sort((a, b) => a.startMs - b.startMs);
  return { ok: true, result: { sessionId, speakers: perUserFiles.map((f) => f.displayName), transcript: allLines } };
}

function formatNamedTranscriptText(named: NamedTranscriptResult): string {
  const header = `Meeting transcript — session ${named.sessionId}\nSpeakers: ${named.speakers.join(', ') || 'none'}\n\n`;
  const body = named.transcript
    .map((line) => (line.kind === 'event'
      ? `[${formatTranscriptTimestamp(line.startMs)}] — ${line.text} —`
      : `[${formatTranscriptTimestamp(line.startMs)}] ${line.name || 'Speaker'}: ${line.text.trim()}`))
    .join('\n');
  return header + body + (named.transcript.length ? '\n' : '');
}

function transcriptPathFor(filename: string): string | null {
  return resolvePrimaryTranscriptPath(filename);
}

function transcriptLockPathFor(filename: string): string | null {
  const filepath = safeRecordingPath(filename);
  if (!filepath) return null;
  return `${filepath}.transcribe.lock`;
}

function deleteRecordingSidecars(filename: string): void {
  for (const sidecarPath of [metadataPathFor(filename), transcriptLockPathFor(filename), participantPathFor(filename)]) {
    if (!sidecarPath) continue;
    try {
      fs.unlinkSync(sidecarPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  deleteAllTranscriptSidecars(filename);
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
  const transcriptPath = resolvePrimaryTranscriptPath(filename);
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

// ── Transcription execution: serialized, post-call only ─────────────────────
// At most ONE transcription runs at a time, so a multi-party session ending (with
// N per-user recordings) never spikes CPU on the signaling box. Transcription is
// invoked post-call (auto on session close) or on demand — never on upload.
const transcribeQueue: Array<{ filename: string; options: TranscribeJobOptions }> = [];
let transcribeRunning = false;

export function enqueueTranscription(
  filename: string,
  options: TranscribeJobOptions = { force: false },
  database: Database.Database = getDb(),
): void {
  if (process.env.MEET_TRANSCRIBE_DISABLED === '1') return;
  if (!isPerUserRecording(filename)) {
    console.log(`[transcribe] skipped mixed/non-per-user recording ${filename}`);
    return;
  }
  if (!transcribeQueue.some((q) => q.filename === filename && q.options.force === options.force && q.options.provider === options.provider && q.options.model === options.model)) {
    transcribeQueue.push({ filename, options });
  }
  pumpTranscribeQueue(database);
}

function pumpTranscribeQueue(database: Database.Database): void {
  if (transcribeRunning) return;
  const next = transcribeQueue.shift();
  if (!next) return;
  transcribeRunning = true;
  spawnTranscription(next.filename, next.options, database, () => {
    transcribeRunning = false;
    pumpTranscribeQueue(database);
  });
}

/**
 * Auto-transcribe a finished session's recordings. Invoked from the signaling
 * layer AFTER the call/session ends — never mid-call. No-op unless the room
 * owner's transcription mode is 'auto'.
 */
export function maybeAutoTranscribeSession(
  ownerEmail: string,
  sessionId: string,
  database: Database.Database = getDb(),
): void {
  if (!ownerEmail || !sessionId) return;
  if (getTranscriptionMode(ownerEmail, database) !== 'auto') return;
  transcribeSessionRecordings(sessionId, ownerEmail, database, { force: false });
}

/** Queue every recording belonging to a session for (serialized) transcription. */
export function transcribeSessionRecordings(
  sessionId: string,
  ownerEmail: string,
  database: Database.Database = getDb(),
  options: TranscribeJobOptions = { force: false },
): number {
  const recordings = listRecordingsForUser(ownerEmail, database, sessionId);
  let queued = 0;
  for (const entry of recordings) {
    if (!isPerUserRecording(entry.filename)) continue;
    enqueueTranscription(entry.filename, options, database);
    queued += 1;
  }
  if (queued > 0) console.log(`[transcribe] queued ${queued} recording(s) for session ${sessionId}`);
  return queued;
}

function spawnTranscription(
  filename: string,
  options: TranscribeJobOptions,
  database: Database.Database = getDb(),
  onDone: () => void = () => {},
): void {
  let settled = false;
  const finish = (): void => { if (!settled) { settled = true; onDone(); } };
  if (process.env.MEET_TRANSCRIBE_DISABLED === '1') return finish();
  const filepath = safeRecordingPath(filename);
  const lockPath = transcriptLockPathFor(filename);
  if (!filepath || !lockPath) return finish();
  const provider = options.provider ?? transcriptionProviderForRecording(filename, database);
  const model = resolveTranscriberModel(filename, provider, database, options.model);
  const versionPath = transcriptVersionPathFor(filename, provider, model);
  if (!options.force && versionPath && fs.existsSync(versionPath)) return finish();
  try {
    fs.writeFileSync(lockPath, JSON.stringify({ startedAtIso: new Date().toISOString(), filename, provider, model }, null, 2));
  } catch (err) {
    console.error('[transcribe] lock create failed', err);
    return finish();
  }
  if (provider === 'openrouter') {
    void runOpenRouterTranscription(filename, filepath, lockPath, model, database, finish);
    return;
  }
  const python = process.env.MEET_TRANSCRIBE_PYTHON || path.join(getRepoRoot(), 'backend', '.venv-transcribe', 'bin', 'python');
  const script = process.env.MEET_TRANSCRIBE_SCRIPT || path.join(getRepoRoot(), 'backend', 'scripts', 'transcribe.py');
  const args = [script, filepath, '--provider', 'local', '--model', model, ...(options.force ? ['--force'] : [])];
  console.log(`[transcribe] start ${filename} provider=local model=${model}`);
  const child = spawn(python, args, {
    cwd: getRepoRoot(),
    env: { ...process.env, WHISPER_MODEL: model },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => console.log(`[transcribe] ${String(chunk).trim()}`));
  child.stderr.on('data', (chunk) => console.error(`[transcribe] ${String(chunk).trim()}`));
  child.on('error', (err) => {
    console.error(`[transcribe] failed to start ${filename}`, err);
    cleanupTranscribeLock(lockPath);
    finish();
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
    finish();
  });
}

function transcriptionProviderForRecording(filename: string, database: Database.Database): TranscriptionProvider {
  const parsed = parseRecordingFilename(filename);
  if (!parsed) return 'local';
  const room = getRoom(parsed.roomId, database);
  if (!room) return 'local';
  return getTranscriptionProvider(room.ownerEmail, database);
}

function resolveTranscriberModel(
  filename: string,
  provider: TranscriptionProvider,
  database: Database.Database,
  override?: string,
): string {
  if (override?.trim()) return override.trim();
  const parsed = parseRecordingFilename(filename);
  if (!parsed) return provider === 'openrouter' ? process.env.OPENROUTER_MODEL || 'openai/whisper-1' : DEFAULT_TRANSCRIBER_MODEL;
  const room = getRoom(parsed.roomId, database);
  if (!room) return provider === 'openrouter' ? process.env.OPENROUTER_MODEL || 'openai/whisper-1' : DEFAULT_TRANSCRIBER_MODEL;
  return provider === 'openrouter'
    ? getCloudTranscriberModel(room.ownerEmail, database)
    : getTranscriberModel(room.ownerEmail, database);
}

async function runOpenRouterTranscription(
  filename: string,
  filepath: string,
  lockPath: string,
  model: string,
  database: Database.Database,
  onDone: () => void,
): Promise<void> {
  try {
    const result = await transcribeViaOpenRouter({ filename, filepath, model });
    if (result === 'written' && (process.env.NODE_ENV !== 'test' || process.env.MEET_LLM_ANALYZE_FAKE === '1')) {
      void runAutoAnalysesForRecording(filename, database).catch((err) => console.error(`[analysis] auto queue failed ${filename}`, err));
    }
  } catch (err) {
    console.error(`[transcribe] openrouter failed for ${filename}`, err);
  } finally {
    cleanupTranscribeLock(lockPath);
    onDone();
  }
}

function parseTranscribeProvider(value: unknown): TranscriptionProvider | undefined {
  if (value === 'local' || value === 'openrouter' || value === 'thirdparty') {
    return value === 'thirdparty' ? 'openrouter' : value;
  }
  return undefined;
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

function sanitizeDisplayNameSlug(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 24).toLowerCase() || 'participant';
}

function participantPathFor(filename: string): string | null {
  const filepath = safeRecordingPath(filename);
  if (!filepath) return null;
  return `${filepath}.participant.json`;
}

function isPerUserRecording(filename: string): boolean {
  const pPath = participantPathFor(filename);
  if (!pPath || !fs.existsSync(pPath)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(pPath, 'utf8')) as { isPerUser?: boolean };
    return parsed.isPerUser === true;
  } catch {
    return false;
  }
}

function isSafeFilename(filename: string): boolean {
  return path.basename(filename) === filename && /^[a-zA-Z0-9_.-]+$/.test(filename);
}

function isUnsafeRecordingFilename(filename: string): boolean {
  return !filename || filename.includes('..') || /[\\/]/.test(filename) || !isSafeFilename(filename);
}
