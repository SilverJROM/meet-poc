import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';

const MAX_DIAGNOSTIC_ENTRIES_PER_SESSION = 720;
const ALLOWED_DIAGNOSTIC_KINDS = new Set(['sample', 'state-change', 'reconnect', 'error', 'call-end']);

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

export type DiagnosticsPayload = {
  kind?: string;
  createdAt?: number;
  peers?: unknown[];
  forceRelay?: boolean;
  [key: string]: unknown;
};

export type DiagnosticEntry = {
  id: string;
  sessionId: string;
  roomId: string;
  roomTitle?: string;
  ownerEmail: string;
  kind: string;
  createdAt: number;
  relayUsed: boolean;
  candidateTypes: string[];
  peerCount: number;
  payload: DiagnosticsPayload;
};

export type DiagnosticSessionSummary = MeetingSession & {
  diagnosticCount: number;
  lastDiagnosticAt: number;
  relayUsed: boolean;
  candidateTypes: string[];
};

type DiagnosticEntryRow = {
  id: string;
  session_id: string;
  room_id: string;
  room_title?: string;
  owner_email: string;
  kind: string;
  created_at: number;
  payload_json: string;
  relay_used: number;
  candidate_types: string | null;
  peer_count: number;
};

type DiagnosticSummaryRow = SessionRow & {
  diagnostic_count: number;
  last_diagnostic_at: number;
  relay_used: number;
  candidate_types: string | null;
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

function toDiagnosticEntry(row: DiagnosticEntryRow): DiagnosticEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    roomId: row.room_id,
    roomTitle: row.room_title,
    ownerEmail: row.owner_email,
    kind: row.kind,
    createdAt: row.created_at,
    relayUsed: row.relay_used === 1,
    candidateTypes: splitCandidateTypes(row.candidate_types),
    peerCount: row.peer_count,
    payload: parsePayload(row.payload_json),
  };
}

function toDiagnosticSummary(row: DiagnosticSummaryRow): DiagnosticSessionSummary {
  return {
    ...toSession(row),
    diagnosticCount: row.diagnostic_count,
    lastDiagnosticAt: row.last_diagnostic_at,
    relayUsed: row.relay_used === 1,
    candidateTypes: splitCandidateTypes(row.candidate_types),
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

export function appendDiagnosticsEntry(
  sessionId: string,
  ownerEmail: string,
  body: unknown,
  database: Database.Database = getDb(),
): DiagnosticEntry | null {
  const payload = normalizeDiagnosticsPayload(body);
  if (!payload) return null;
  const session = database
    .prepare(
      `
        SELECT s.id, s.room_id, r.title AS room_title, s.host_email, s.started_at, s.ended_at, s.ended_reason, s.admitted_peak
        FROM meeting_sessions s
        JOIN rooms r ON r.id = s.room_id
        WHERE s.id = ? AND r.owner_email = ?
        LIMIT 1
      `,
    )
    .get(sessionId, ownerEmail) as SessionRow | undefined;
  if (!session) return null;

  const summary = summarizeDiagnosticsPayload(payload);
  const entry = {
    id: crypto.randomUUID(),
    sessionId,
    roomId: session.room_id,
    ownerEmail,
    kind: summary.kind,
    createdAt: Date.now(),
    payloadJson: JSON.stringify(payload),
    relayUsed: summary.relayUsed ? 1 : 0,
    candidateTypes: summary.candidateTypes.join(','),
    peerCount: summary.peerCount,
  };

  const insert = database.transaction(() => {
    database
      .prepare(
        `
          INSERT INTO meeting_session_diagnostics
            (id, session_id, room_id, owner_email, kind, created_at, payload_json, relay_used, candidate_types, peer_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        entry.id,
        entry.sessionId,
        entry.roomId,
        entry.ownerEmail,
        entry.kind,
        entry.createdAt,
        entry.payloadJson,
        entry.relayUsed,
        entry.candidateTypes,
        entry.peerCount,
      );
    database
      .prepare(
        `
          DELETE FROM meeting_session_diagnostics
          WHERE session_id = ?
            AND id NOT IN (
              SELECT id
              FROM meeting_session_diagnostics
              WHERE session_id = ?
              ORDER BY created_at DESC
              LIMIT ?
            )
        `,
      )
      .run(sessionId, sessionId, MAX_DIAGNOSTIC_ENTRIES_PER_SESSION);
  });
  insert();

  return getDiagnosticsEntry(ownerEmail, entry.id, database);
}

export function listDiagnosticsSessionsForOwner(
  ownerEmail: string,
  page: number,
  pageSize: number,
  database: Database.Database = getDb(),
): { rows: DiagnosticSessionSummary[]; total: number } {
  const offset = (page - 1) * pageSize;
  const filter = `
    FROM meeting_sessions s
    JOIN rooms r ON r.id = s.room_id
    JOIN meeting_session_diagnostics d ON d.session_id = s.id
    WHERE r.owner_email = ?
  `;
  const totalRow = database
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM (
          SELECT s.id
          ${filter}
          GROUP BY s.id
        )
      `,
    )
    .get(ownerEmail) as { total: number };
  const rows = database
    .prepare(
      `
        SELECT
          s.id,
          s.room_id,
          r.title AS room_title,
          s.host_email,
          s.started_at,
          s.ended_at,
          s.ended_reason,
          s.admitted_peak,
          COUNT(d.id) AS diagnostic_count,
          MAX(d.created_at) AS last_diagnostic_at,
          MAX(d.relay_used) AS relay_used,
          GROUP_CONCAT(DISTINCT d.candidate_types) AS candidate_types
        ${filter}
        GROUP BY s.id, s.room_id, r.title, s.host_email, s.started_at, s.ended_at, s.ended_reason, s.admitted_peak
        ORDER BY last_diagnostic_at DESC
        LIMIT ? OFFSET ?
      `,
    )
    .all(ownerEmail, pageSize, offset)
    .map((row) => toDiagnosticSummary(row as DiagnosticSummaryRow));
  return { rows, total: totalRow.total };
}

export function getDiagnosticsForSession(
  ownerEmail: string,
  sessionId: string,
  database: Database.Database = getDb(),
): { session: MeetingSession; entries: DiagnosticEntry[] } | null {
  const sessionRow = database
    .prepare(
      `
        SELECT s.id, s.room_id, r.title AS room_title, s.host_email, s.started_at, s.ended_at, s.ended_reason, s.admitted_peak
        FROM meeting_sessions s
        JOIN rooms r ON r.id = s.room_id
        WHERE s.id = ? AND r.owner_email = ?
        LIMIT 1
      `,
    )
    .get(sessionId, ownerEmail) as SessionRow | undefined;
  if (!sessionRow) return null;
  const entries = database
    .prepare(
      `
        SELECT d.id, d.session_id, d.room_id, r.title AS room_title, d.owner_email, d.kind, d.created_at, d.payload_json, d.relay_used, d.candidate_types, d.peer_count
        FROM meeting_session_diagnostics d
        JOIN rooms r ON r.id = d.room_id
        WHERE d.session_id = ? AND d.owner_email = ?
        ORDER BY d.created_at ASC
      `,
    )
    .all(sessionId, ownerEmail)
    .map((row) => toDiagnosticEntry(row as DiagnosticEntryRow));
  return { session: toSession(sessionRow), entries };
}

function getDiagnosticsEntry(ownerEmail: string, id: string, database: Database.Database): DiagnosticEntry | null {
  const row = database
    .prepare(
      `
        SELECT d.id, d.session_id, d.room_id, r.title AS room_title, d.owner_email, d.kind, d.created_at, d.payload_json, d.relay_used, d.candidate_types, d.peer_count
        FROM meeting_session_diagnostics d
        JOIN rooms r ON r.id = d.room_id
        WHERE d.id = ? AND d.owner_email = ?
        LIMIT 1
      `,
    )
    .get(id, ownerEmail) as DiagnosticEntryRow | undefined;
  return row ? toDiagnosticEntry(row) : null;
}

function normalizeDiagnosticsPayload(body: unknown): DiagnosticsPayload | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const payload = { ...(body as Record<string, unknown>) };
  const kind = String(payload.kind || 'sample');
  payload.kind = ALLOWED_DIAGNOSTIC_KINDS.has(kind) ? kind : 'sample';
  if (typeof payload.createdAt !== 'number') payload.createdAt = Date.now();
  return payload;
}

function summarizeDiagnosticsPayload(payload: DiagnosticsPayload): { kind: string; relayUsed: boolean; candidateTypes: string[]; peerCount: number } {
  const peers = Array.isArray(payload.peers) ? payload.peers : [];
  const candidateTypes = new Set<string>();
  let relayUsed = payload.forceRelay === true;
  for (const peer of peers) {
    if (!peer || typeof peer !== 'object') continue;
    const record = peer as Record<string, unknown>;
    const candidateType = typeof record.selectedCandidateType === 'string' ? record.selectedCandidateType : '';
    if (candidateType) candidateTypes.add(candidateType);
    if (candidateType === 'relay' || record.relayUsed === true) relayUsed = true;
  }
  return {
    kind: String(payload.kind || 'sample'),
    relayUsed,
    candidateTypes: [...candidateTypes].sort(),
    peerCount: peers.length,
  };
}

function splitCandidateTypes(value: string | null | undefined): string[] {
  return [...new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean))].sort();
}

function parsePayload(value: string): DiagnosticsPayload {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as DiagnosticsPayload) : {};
  } catch {
    return {};
  }
}
