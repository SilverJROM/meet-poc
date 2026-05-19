import { Router } from 'express';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { listActiveForOwner, listEndedForOwner, type MeetingSession } from './store.js';

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function mapSession(session: MeetingSession, includeEndedFields = false): Record<string, unknown> {
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
  }
  return mapped;
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
      return res.json({
        sessions: result.rows.map((session) => mapSession(session, true)),
        page,
        pageSize,
        total: result.total,
      });
    }

    return res.status(400).json({ error: 'invalid status' });
  });

  return router;
}
