import { Router, type Request } from 'express';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';
import { parseCookies } from '../../lib/cookies.js';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { getSessionUser } from '../auth/sessions.js';
import { countRecordingsBySessionForUser } from '../recording/index.js';
import { isAdmittedDiagnosticPoster } from '../signaling/index.js';
import {
  appendDiagnosticsEntry,
  getDiagnosticsForSession,
  listActiveForOwner,
  listDiagnosticsSessionsForOwner,
  listEndedForOwner,
  type DiagnosticEntry,
  type DiagnosticSessionSummary,
  type MeetingSession,
} from './store.js';

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function mapSession(session: MeetingSession, includeEndedFields = false, recordingsCount = 0): Record<string, unknown> {
  const mapped: Record<string, unknown> = {
    id: session.id,
    roomId: session.roomId,
    roomTitle: session.roomTitle || '',
    hostEmail: session.hostEmail,
    startedAtIso: new Date(session.startedAt).toISOString(),
    admittedPeak: session.admittedPeak,
  };
  if (includeEndedFields && session.endedAt != null) {
    mapped.endedAtIso = new Date(session.endedAt).toISOString();
    mapped.endedReason = session.endedReason || undefined;
    mapped.durationMs = session.endedAt - session.startedAt;
    mapped.recordingsCount = recordingsCount;
  }
  return mapped;
}

function mapDiagnosticSummary(session: DiagnosticSessionSummary): Record<string, unknown> {
  return {
    ...mapSession(session, session.endedAt != null),
    diagnosticCount: session.diagnosticCount,
    lastDiagnosticAtIso: new Date(session.lastDiagnosticAt).toISOString(),
    relayUsed: session.relayUsed,
    candidateTypes: session.candidateTypes,
  };
}

function mapDiagnosticEntry(entry: DiagnosticEntry): Record<string, unknown> {
  return {
    id: entry.id,
    sessionId: entry.sessionId,
    roomId: entry.roomId,
    roomTitle: entry.roomTitle || '',
    kind: entry.kind,
    createdAtIso: new Date(entry.createdAt).toISOString(),
    relayUsed: entry.relayUsed,
    candidateTypes: entry.candidateTypes,
    peerCount: entry.peerCount,
    payload: entry.payload,
  };
}

function optionalUserEmail(req: Request, database: Database.Database): string | null {
  const cookies = parseCookies(req.headers.cookie);
  return getSessionUser(cookies.session, database)?.email || null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function sessionsRouter(database: Database.Database = getDb()): Router {
  const router = Router();
  const auth = requireAuth(database);

  router.get('/meeting-sessions', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const status = String(req.query.status || '');

    if (status === 'active') {
      const sessions = listActiveForOwner(authed.user.email, database);
      return res.json({
        sessions: sessions.map((session) => mapSession(session)),
        total: sessions.length,
      });
    }

    if (status === 'ended') {
      const page = parsePositiveInt(req.query.page, 1);
      const requestedPageSize = parsePositiveInt(req.query.pageSize, 20);
      const pageSize = Math.min(requestedPageSize, 100);
      const result = listEndedForOwner(authed.user.email, page, pageSize, database);
      const recordingCounts = countRecordingsBySessionForUser(authed.user.email, database);
      return res.json({
        sessions: result.rows.map((session) => mapSession(session, true, recordingCounts.get(session.id) || 0)),
        page,
        pageSize,
        total: result.total,
      });
    }

    return res.status(400).json({ error: 'invalid status' });
  });

  router.get('/meeting-sessions/diagnostics-log', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const page = parsePositiveInt(req.query.page, 1);
    const requestedPageSize = parsePositiveInt(req.query.pageSize, 20);
    const pageSize = Math.min(requestedPageSize, 100);
    const result = listDiagnosticsSessionsForOwner(authed.user.email, page, pageSize, database);
    return res.json({
      sessions: result.rows.map((session) => mapDiagnosticSummary(session)),
      page,
      pageSize,
      total: result.total,
    });
  });

  router.get('/meeting-sessions/:sessionId/diagnostics', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const result = getDiagnosticsForSession(authed.user.email, String(req.params.sessionId || ''), database);
    if (!result) return res.status(404).json({ error: 'not found' });
    return res.json({
      session: mapSession(result.session, true),
      entries: result.entries.map((entry) => mapDiagnosticEntry(entry)),
    });
  });

  router.get('/meeting-sessions/:sessionId/diagnostics.json', auth, (req, res) => {
    const authed = req as AuthenticatedRequest;
    const result = getDiagnosticsForSession(authed.user.email, String(req.params.sessionId || ''), database);
    if (!result) return res.status(404).json({ error: 'not found' });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="meeting-diagnostics-${result.session.id}.json"`);
    return res.json({
      session: mapSession(result.session, true),
      entries: result.entries.map((entry) => mapDiagnosticEntry(entry)),
    });
  });

  router.post('/meeting-sessions/:sessionId/diagnostics', (req, res) => {
    const sessionId = String(req.params.sessionId || '');
    const userEmail = optionalUserEmail(req, database);
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
    const admitted = isAdmittedDiagnosticPoster({
      sessionId,
      clientId: stringOrNull(body.clientId),
      participantId: stringOrNull(body.participantId),
      clientKey: stringOrNull(body.clientKey),
      userEmail,
    });
    if (!admitted) return res.status(403).json({ error: 'forbidden' });
    const entry = appendDiagnosticsEntry(sessionId, null, req.body, database);
    if (!entry) return res.status(404).json({ error: 'not found' });
    return res.json({ ok: true, entry: mapDiagnosticEntry(entry) });
  });

  return router;
}
