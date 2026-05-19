import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';

export type MeetingSession = {
  id: string;
  roomId: string;
  roomTitle?: string;
  hostEmail: string;
  startedAt: number;
  endedAt: number | null;
  endedReason: string | null;
  admittedPeak: number;
};

type SessionRow = {
  id: string;
  room_id: string;
  room_title?: string;
  host_email: string;
  started_at: number;
  ended_at: number | null;
  ended_reason: string | null;
  admitted_peak: number;
};

function toSession(row: SessionRow): MeetingSession {
  return {
    id: row.id,
    roomId: row.room_id,
    roomTitle: row.room_title,
    hostEmail: row.host_email,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    endedReason: row.ended_reason,
    admittedPeak: row.admitted_peak,
  };
}

export function openSession(roomId: string, hostEmail: string, database: Database.Database = getDb()): MeetingSession {
  const existing = getOpenSessionByRoom(roomId, database);
  if (existing) return existing;

  const session = {
    id: crypto.randomUUID(),
    roomId,
    hostEmail,
    startedAt: Date.now(),
    endedAt: null,
    endedReason: null,
    admittedPeak: 0,
  };
  database
    .prepare(
      'INSERT INTO meeting_sessions (id, room_id, host_email, started_at, ended_at, ended_reason, admitted_peak) VALUES (?, ?, ?, ?, NULL, NULL, 0)',
    )
    .run(session.id, session.roomId, session.hostEmail, session.startedAt);
  return session;
}

export function getOpenSessionFor(
  roomId: string,
  hostEmail: string,
  database: Database.Database = getDb(),
): MeetingSession | null {
  const row = database
    .prepare(
      'SELECT id, room_id, host_email, started_at, ended_at, ended_reason, admitted_peak FROM meeting_sessions WHERE room_id = ? AND host_email = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
    )
    .get(roomId, hostEmail) as SessionRow | undefined;
  return row ? toSession(row) : null;
}

export function getOpenSessionByRoom(roomId: string, database: Database.Database = getDb()): MeetingSession | null {
  const row = database
    .prepare(
      'SELECT id, room_id, host_email, started_at, ended_at, ended_reason, admitted_peak FROM meeting_sessions WHERE room_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
    )
    .get(roomId) as SessionRow | undefined;
  return row ? toSession(row) : null;
}

export function closeSession(
  sessionId: string | null | undefined,
  reason: string,
  database: Database.Database = getDb(),
): MeetingSession | null {
  if (!sessionId) return null;
  const endedAt = Date.now();
  database
    .prepare('UPDATE meeting_sessions SET ended_at = ?, ended_reason = ? WHERE id = ? AND ended_at IS NULL')
    .run(endedAt, reason, sessionId);
  const row = database
    .prepare('SELECT id, room_id, host_email, started_at, ended_at, ended_reason, admitted_peak FROM meeting_sessions WHERE id = ?')
    .get(sessionId) as SessionRow | undefined;
  return row ? toSession(row) : null;
}

export function bumpPeak(
  sessionId: string | null | undefined,
  currentAdmittedCount: number,
  database: Database.Database = getDb(),
): void {
  if (!sessionId) return;
  database
    .prepare('UPDATE meeting_sessions SET admitted_peak = ? WHERE id = ? AND admitted_peak < ?')
    .run(currentAdmittedCount, sessionId, currentAdmittedCount);
}

export function listActiveForOwner(ownerEmail: string, database: Database.Database = getDb()): MeetingSession[] {
  return database
    .prepare(
      `
        SELECT s.id, s.room_id, r.title AS room_title, s.host_email, s.started_at, s.ended_at, s.ended_reason, s.admitted_peak
        FROM meeting_sessions s
        JOIN rooms r ON r.id = s.room_id
        WHERE s.ended_at IS NULL AND r.owner_email = ?
        ORDER BY s.started_at DESC
      `,
    )
    .all(ownerEmail)
    .map((row) => toSession(row as SessionRow));
}

export function listEndedForOwner(
  ownerEmail: string,
  page: number,
  pageSize: number,
  database: Database.Database = getDb(),
): { rows: MeetingSession[]; total: number } {
  const offset = (page - 1) * pageSize;
  const filter = `
    FROM meeting_sessions s
    JOIN rooms r ON r.id = s.room_id
    WHERE s.ended_at IS NOT NULL
      AND s.admitted_peak >= 1
      AND (s.ended_at - s.started_at) >= 10000
      AND r.owner_email = ?
  `;
  const totalRow = database.prepare(`SELECT COUNT(*) AS total ${filter}`).get(ownerEmail) as { total: number };
  const rows = database
    .prepare(
      `
        SELECT s.id, s.room_id, r.title AS room_title, s.host_email, s.started_at, s.ended_at, s.ended_reason, s.admitted_peak
        ${filter}
        ORDER BY s.started_at DESC
        LIMIT ? OFFSET ?
      `,
    )
    .all(ownerEmail, pageSize, offset)
    .map((row) => toSession(row as SessionRow));
  return { rows, total: totalRow.total };
}
